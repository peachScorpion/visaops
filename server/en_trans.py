# -*- coding: utf-8 -*-
"""中译英 —— 客人填的是中文，DS-160 官网只收英文/拼音，中间这一步一直缺着。

唐美芳 2026-09-03：「填写完所有资料后，还得翻译成英文，所以还得有这个操作，
最后才是提交到美国签证中心官网呢」。

三种生成方式，按 form_field.en_rule 分：
  pinyin_name  人名 → 全大写拼音，护照口径（SHANG/YUHAN）
  pinyin_place 地名 → 首字母大写拼音（Beijing）
  translate    自由文本 → 真翻译（地址、单位名、职位、职责、语言）

前两种本地算，秒出且稳定；第三种调本机 claude CLI 批量翻一次（十几秒）。
**翻译结果一律当草稿**：写进 value_en 后专员可以逐格改，改完才算数——
地址、单位名这类错一个词就可能被使领馆问，机器翻的不能直接当最终答案。
"""
import json
import os
import re
import shutil
import subprocess


def _claude_bin():
    """找 claude 可执行文件。

    ⚠️ 不能直接写 "claude"：systemd 起的服务进程 PATH 很干净，
    不含 ~/.local/bin，subprocess 会 FileNotFoundError，翻译静默失败
    （2026-09-03 实测：命令行直接跑 6.9 秒出结果，走接口却一格都翻不出来）。"""
    p = shutil.which("claude")
    if p:
        return p
    for cand in (os.path.expanduser("~/.local/bin/claude"),
                 "/usr/local/bin/claude", "/usr/bin/claude"):
        if os.path.exists(cand):
            return cand
    return None

try:
    from pypinyin import lazy_pinyin, Style
    HAS_PINYIN = True
except Exception:                                    # pragma: no cover
    HAS_PINYIN = False

CN = re.compile(r"[一-鿿]")
# 官网对「没有这一项」的写法是 N/A（部分格子勾 Does Not Apply），不是拼音
NIL_CN = ("无", "没有", "不适用", "无此项", "暂无")
NO_CN = ("否", "不是", "没有过")


def has_cn(s):
    return bool(CN.search(s or ""))


# 常见复姓。姓氏切错会让护照与 DS-160 对不上，这是使领馆最容易挑出来的错。
SURNAME2 = ("欧阳", "上官", "司马", "诸葛", "东方", "独孤", "南宫", "万俟", "闻人",
            "夏侯", "皇甫", "尉迟", "公羊", "澹台", "公冶", "宗政", "濮阳", "淳于",
            "单于", "太叔", "申屠", "公孙", "仲孙", "轩辕", "令狐", "钟离", "宇文",
            "长孙", "慕容", "鲜于", "闾丘", "司徒", "司空", "百里", "东郭", "南门",
            "呼延", "羊舌", "微生", "梁丘", "左丘", "东门", "西门")


def _one_name(p):
    """单个中文姓名 → 护照口径：姓全大写在前、名各字连写。尚予涵 → SHANG YUHAN"""
    sur = p[:2] if p[:2] in SURNAME2 else p[:1]
    given = p[len(sur):]
    a = "".join(lazy_pinyin(sur, style=Style.NORMAL)).upper()
    b = "".join(lazy_pinyin(given, style=Style.NORMAL)).upper() if given else ""
    return (a + " " + b).strip()


def to_pinyin_name(s):
    """人名 → 护照口径全大写。多个人名用「、」「，」分隔的逐个转。
    注意分隔符里<b>不能有 /</b>——护照上的英文名本来就写成 SHANG/YUHAN，
    按 / 切会把它拆成两个人。"""
    if not s or not HAS_PINYIN:
        return ""
    parts = re.split(r"[、,，;；]+", s)
    out = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if not has_cn(p):
            out.append(p)                            # 本来就是英文/数字，原样留
            continue
        out.append(_one_name(p))
    return "、".join(out)


def to_pinyin_place(s):
    """地名 → 拼音<b>连写</b>、首字母大写：北京 → Beijing、黑龙江 → Heilongjiang。
    逐字加空格（Bei Jing）不是地名的英文写法，官网上填了会显得很业余。"""
    if not s or not HAS_PINYIN:
        return ""
    if not has_cn(s):
        return s
    # 「北京市朝阳区」这种带行政区划后缀的，按后缀切开分别连写
    parts = re.split(r"(?<=[省市区县州盟旗])", s)
    out = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if not has_cn(p):
            out.append(p)
            continue
        core = re.sub(r"[省市区县州盟旗]$", "", p) or p
        out.append("".join(lazy_pinyin(core, style=Style.NORMAL)).capitalize())
    return " ".join(out)


PROMPT = (
    "你是签证材料翻译。把下面每条中文按美国 DS-160 非移民签证申请表的英文填写规范翻译成英文。\n"
    "要求：\n"
    "1. 地址按英文习惯从小到大（房间/楼号, 街道门牌, 区, 市, 省），不要写国家；\n"
    "2. 单位、学校用其官方英文名，没有官方名的按字面直译；\n"
    "3. 职位、工作职责用简洁的英文短语，职责不超过 25 个词；\n"
    "4. 人名一律用拼音，姓全大写在前；\n"
    "5. 只输出 JSON，键是编号字符串，值是英文，不要任何解释或代码块标记。\n\n"
)


def ai_translate(items, timeout=180):
    """items: [(key, 中文)]。返回 {key: 英文}。失败返回 {}，调用方降级为留空。"""
    items = [(k, v) for k, v in items if v and has_cn(v)]
    if not items:
        return {}
    lines = "\n".join("%d. %s" % (i + 1, v) for i, (_, v) in enumerate(items))
    exe = _claude_bin()
    if not exe:
        return {}
    env = dict(os.environ)
    env.setdefault("HOME", os.path.expanduser("~"))
    try:
        r = subprocess.run([exe, "-p", PROMPT + lines],
                           capture_output=True, text=True, timeout=timeout, env=env)
    except Exception:
        return {}
    if r.returncode != 0:
        return {}
    txt = r.stdout or ""
    m = re.search(r"\{[\s\S]*\}", txt)               # 容忍模型裹了 ```json
    if not m:
        return {}
    try:
        data = json.loads(m.group(0))
    except Exception:
        return {}
    out = {}
    for i, (k, _) in enumerate(items):
        v = data.get(str(i + 1))
        if isinstance(v, str) and v.strip():
            out[k] = v.strip()
    return out


def build(fields, answers, timeout=180):
    """给一张表算出各格的英文。
    fields: [{id, name, en_rule}]（只传 need_en=1 的）
    answers: {field_id: 中文值}
    返回 {field_id: 英文}，以及本次哪些是 AI 翻的（供留痕）。
    """
    out, need_ai = {}, []
    for f in fields:
        v = (answers.get(f["id"]) or "").strip()
        if not v:
            continue
        # 「无 / 没有 / 不适用 / 否」是「这一项没有」的占位答案，不是内容。
        # 不拦住的话「曾用名 = 无」会被当人名转成拼音 WU，填到官网上就是个笑话。
        if v in NIL_CN:
            out[f["id"]] = "N/A"
            continue
        if v in NO_CN:
            out[f["id"]] = "No"
            continue
        rule = f["en_rule"] or "translate"
        if not has_cn(v):
            out[f["id"]] = v                         # 已经是英文，原样沿用
        elif rule == "pinyin_name":
            # 人名拼音是确定规则，本地算又快又稳，AI 反而可能自作主张改写
            out[f["id"]] = to_pinyin_name(v)
        else:
            # 地名也走 AI：拼音库处理不了多音字与约定译名——
            # 「朝阳区」会被转成 Zhaoyang（实际读 Cháo）、
            # 「内蒙古自治区」该是 Inner Mongolia 而不是 Neimenggu。
            need_ai.append((f["id"], v))
    ai = ai_translate(need_ai, timeout=timeout) if need_ai else {}
    out.update(ai)
    # AI 没翻出来的地名，退回拼音兜底，总比空着强（专员可改）
    fallback = []
    for f in fields:
        fid = f["id"]
        if fid in out or fid not in [k for k, _ in need_ai]:
            continue
        v = (answers.get(fid) or "").strip()
        if (f["en_rule"] or "") == "pinyin_place" and v:
            out[fid] = to_pinyin_place(v)
            fallback.append(fid)
    return out, list(ai.keys()), [k for k, _ in need_ai
                                  if k not in ai and k not in fallback]

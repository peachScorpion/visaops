#!/usr/bin/env python3
"""初始化 VisaOps 数据库并灌入美国签证验收数据。"""
import json
import os
import random
import sqlite3
import string
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "visaops.db")
WEB = os.path.abspath(os.path.join(HERE, "..", "web"))


def now(offset_days=0):
    return (datetime.now() + timedelta(days=offset_days)).strftime("%Y-%m-%d %H:%M:%S")


def ver():
    return "".join(random.choice(string.ascii_uppercase + string.digits) for _ in range(6))


CROWD_ALL = ["job", "free", "student", "retire", "child"]

# 美国 B1/B2 材料清单：(资料名, 原件/复印件, 提供方式, 份数, 必要性, 要求, 适用人群)
US_ITEMS = [
    ("护照", "origin", ["mail"], 1, "must",
     "有效期需超过预计离境日期 6 个月以上；末页需本人签名；含所有旧护照及签证页", CROWD_ALL),
    ("近半年白底彩色照片", "origin", ["mail", "upload"], 2, "must",
     "51mm×51mm 方形白底，头部占比 50%–69%，不戴眼镜，六个月内拍摄", CROWD_ALL),
    ("DS-160 确认页", "origin", ["upload", "carry"], 1, "must",
     "在线填写后打印确认页，须含条形码与 Application ID，信息须与护照完全一致", CROWD_ALL),
    ("面签预约确认单", "origin", ["upload", "carry"], 1, "must",
     "CGI 系统预约成功后下载，含预约日期、时间与领区", CROWD_ALL),
    ("签证费收据", "copy", ["upload"], 1, "must",
     "CGI 缴费收据号，用于预约面签时间", CROWD_ALL),
    ("身份证正反面复印件", "copy", ["mail", "upload"], 1, "must",
     "复印在同一张 A4 纸正面，需清晰可辨", ["job", "free", "student", "retire"]),
    ("户口本整本复印件", "copy", ["mail"], 1, "must",
     "含户主页、本人页；集体户口提供户口卡或加盖公章的户籍证明", CROWD_ALL),
    ("在职证明", "origin", ["mail"], 1, "must",
     "公司抬头纸打印，注明职位、入职时间、年薪、准假期限，加盖公章并留负责人签字与联系方式", ["job"]),
    ("营业执照副本复印件", "copy", ["mail"], 1, "must",
     "加盖公司红章，与在职证明单位一致", ["job"]),
    ("近 6 个月银行流水", "origin", ["mail"], 1, "must",
     "银行打印并盖章，余额建议 5 万以上，有稳定进账记录", ["job", "free", "retire"]),
    ("房产/车产证明复印件", "copy", ["mail"], 1, "suggest",
     "作为约束力材料，有助于证明回国意愿", ["job", "free", "retire"]),
    ("退休证复印件", "copy", ["mail"], 1, "must",
     "复印清晰，与身份证信息一致", ["retire"]),
    ("在读证明", "origin", ["mail"], 1, "must",
     "学校开具并盖章，注明就读年级与准假情况", ["student"]),
    ("学生证复印件", "copy", ["mail"], 1, "must", "含注册章页", ["student"]),
    ("出生证明原件", "origin", ["mail", "carry"], 1, "must",
     "18 岁以下随行儿童必交，需与父母关系一致", ["child"]),
    ("父母双方同意函", "origin", ["mail"], 1, "must",
     "儿童单独或随一方出行时提供，双方签字", ["child"]),
    ("行程单", "origin", ["upload"], 1, "suggest",
     "含往返航班、酒店预订与每日行程安排", CROWD_ALL),
    ("邀请函", "copy", ["upload"], 1, "suggest",
     "如有美方亲友或商务邀请方，提供邀请函及对方身份证明", ["job", "free"]),
]

# 通用材料项：非美签国家共用的基础项（不含 DS-160 / 面签预约单 / 签证费收据等美签专属件）
GEN_ITEMS = [it for it in US_ITEMS
             if it[0] not in ("DS-160 确认页", "面签预约确认单", "签证费收据", "邀请函")]

# 美国 F1 学生签证：同一个国家，材料清单与旅游签完全不同
US_F1_ITEMS = [
    ("护照", "origin", ["mail"], 1, "must",
     "有效期需超过预计离境日期 6 个月以上；含所有旧护照及签证页", CROWD_ALL),
    ("近半年白底彩色照片", "origin", ["mail", "upload"], 2, "must",
     "51mm×51mm 方形白底，六个月内拍摄", CROWD_ALL),
    ("DS-160 确认页", "origin", ["upload", "carry"], 1, "must",
     "在线填写后打印确认页，须含条形码与 Application ID", CROWD_ALL),
    ("I-20 表格原件", "origin", ["mail", "carry"], 1, "must",
     "由录取学校签发，须本人签字；F1 学生签核心材料", ["student"]),
    ("SEVIS 费缴费收据", "copy", ["upload"], 1, "must",
     "I-901 SEVIS 费缴纳后打印，须与 I-20 上的 SEVIS ID 一致", ["student"]),
    ("学校录取通知书", "copy", ["upload"], 1, "must",
     "含专业、学制、开学日期", ["student"]),
    ("最高学历毕业证与学位证", "copy", ["mail", "upload"], 1, "must",
     "在读学生提供在读证明", ["student"]),
    ("成绩单", "origin", ["mail"], 1, "must",
     "学校密封盖章，中英文对照", ["student"]),
    ("语言成绩单（托福/雅思）", "copy", ["upload"], 1, "suggest",
     "有则提供，成绩须在有效期内", ["student"]),
    ("资金证明", "origin", ["mail"], 1, "must",
     "覆盖第一年学费与生活费，通常需 30 万元以上定期存款证明", ["student"]),
    ("父母收入与在职证明", "origin", ["mail"], 1, "must",
     "由资助人单位开具，注明职位与年收入", ["student"]),
    ("亲属关系证明", "copy", ["mail"], 1, "must",
     "户口本或公证书，证明与资助人的关系", ["student"]),
]

# 第三项是真实存在的样例图文件名，由 gen_samples.py 生成到 web/uploads/samples/。
# 不放空 url——运营点开「查看样例」必须真的看得到图。
SAMPLES = [
    ("护照通用样例", "护照", "护照资料页样例.jpg"),
    ("美签照片规格样例", "近半年白底彩色照片", "美签照片规格样例.jpg"),
    ("在职证明模板", "在职证明", "在职证明模板.jpg"),
    ("DS-160 确认页样例", "DS-160 确认页", "DS-160确认页样例.jpg"),
    ("银行流水样例", "近 6 个月银行流水", "银行流水样例.jpg"),
]


def main():
    if os.path.exists(DB):
        os.remove(DB)
    for ext in ("-wal", "-shm"):
        p = DB + ext
        if os.path.exists(p):
            os.remove(p)

    c = sqlite3.connect(DB)
    c.executescript(open(os.path.join(HERE, "schema.sql")).read())

    def ins(table, **kw):
        cols = ",".join(kw)
        qs = ",".join("?" * len(kw))
        cur = c.execute(f"insert into {table}({cols}) values({qs})", list(kw.values()))
        return cur.lastrowid

    # --- 组织 ---
    plat = ins("org", kind="platform", name="众信旅游集团", short="众信", status="active", created_at=now())
    sup1 = ins("org", kind="supplier", name="优耐德签证服务（北京）有限公司", short="优耐德",
               license="JL-2021-0388", contract_no="HT-2026-0117", bank_acct="工商银行 6222****8841",
               status="active", created_at=now())
    sup2 = ins("org", kind="supplier", name="竹园国际旅行社", short="竹园",
               license="JL-2019-1102", contract_no="HT-2026-0210", bank_acct="建设银行 6217****3390",
               status="active", created_at=now())
    store = ins("org", kind="store", name="众信旅游国贸门店", short="国贸店", status="active", created_at=now())
    agency = ins("org", kind="agency", name="蓝天国际旅行社", short="蓝天", status="active", created_at=now())

    # --- 用户 ---
    U = {}
    for login, name, role, org, phone in [
        ("c1", "张思远", "customer", None, "13800001111"),
        ("c2", "李佳宁", "customer", None, "13800002222"),
        ("sales", "王磊", "csp", store, "13900003333"),
        ("agent", "周敏", "csp", agency, "13900004444"),
        ("op1", "陈曦", "uom", plat, "13700005555"),
        ("op2", "赵однако", "uom", plat, "13700006666"),
        ("lead", "孙涛", "lead", plat, "13700007777"),
        ("fin", "刘颖", "fin", plat, "13700008888"),
        ("sup", "郑海", "ubk", sup1, "13600009999"),
        ("sup2", "何静", "ubk", sup2, "13600001010"),
        ("ops", "管理员", "ops", plat, "13500001212"),
    ]:
        U[login] = ins("user", login=login, pwd="888888", name=name, role=role,
                       org_id=org, phone=phone, email=login + "@example.com", created_at=now())
    c.execute("update user set name='赵岩' where login='op2'")

    # --- 地址 ---
    a_sup1 = ins("addr", owner_kind="org", owner_id=sup1, region="北京市朝阳区",
                 detail="东三环北路 甲2号 交通银行大厦 18层 签证收料部", contact="收料组", phone="010-85276600", is_default=1)
    ins("addr", owner_kind="org", owner_id=sup2, region="上海市黄浦区",
        detail="南京西路 288号 创兴金融中心 22层", contact="签证中心", phone="021-63501122", is_default=1)
    a_c1 = ins("addr", owner_kind="user", owner_id=U["c1"], region="北京市海淀区",
               detail="中关村大街 27号 数码大厦 9层 903", contact="张思远", phone="13800001111", is_default=1)

    # --- 样例模版库 ---
    tpl_id = {}
    for i, (nm, mat, fn) in enumerate(SAMPLES, 1):
        fp = os.path.join(WEB, "uploads", "samples", fn)
        if not os.path.exists(fp):
            raise SystemExit("缺少样例图 %s，先跑 python3 gen_samples.py" % fp)
        tpl_id[mat] = ins("sample_tpl", code="TPL-%03d" % i, name=nm, mat_name=mat,
                          files=json.dumps([{"name": fn, "url": "/visaops/uploads/samples/" + fn,
                                             "size": os.path.getsize(fp)}]), created_at=now())

    # --- 完整版材料库（平台版） ---
    # 清单的唯一键是「国家 + 签证类型」，不是国家：
    # 同一个国家可以有多份清单（美国旅游签 vs 美国学生签），
    # 同一份清单又可以被多条目录产品共用（美签北京/上海/广州送签材料一致，产品是三条）。
    # created 是建单日期偏移（天），让列表按创建时间倒序时顺序稳定可读
    def mkfv(country, visa_type, name, items, eff=-30, active=1, status="published", created=-60):
        fid = ins("fullver", ver_no=ver(), country=country, visa_type=visa_type, name=name,
                  owner_org=0, status=status, effective_at=now(eff), active=active,
                  created_at=now(created), updated_at=now(created))
        for i, (nm, attr, ways, copies, nec, req, crowds) in enumerate(items):
            ins("fullver_item", fullver_id=fid, mat_name=nm, attr=attr,
                provide_way=json.dumps(ways), copies=copies, necessity=nec, require_text=req,
                sample_tpl_id=tpl_id.get(nm), crowds=json.dumps(crowds), sort=i)
        return fid

    fv = mkfv("美国", "个人旅游签证（B1/B2）", "美国个人旅游签证（B1/B2）资料清单", US_ITEMS, created=-52)
    fv_us_f1 = mkfv("美国", "F1 学生签证", "美国 F1 学生签证资料清单", US_F1_ITEMS, created=-46)
    fv_jp = mkfv("日本", "个人旅游签证", "日本个人旅游签证资料清单", GEN_ITEMS, created=-40)
    fv_uk = mkfv("英国", "标准访问签证（Standard Visitor）", "英国标准访问签证资料清单", GEN_ITEMS, created=-34)
    fv_kr = mkfv("韩国", "个人旅游签证", "韩国个人旅游签证资料清单", GEN_ITEMS, created=-28)
    fv_au = mkfv("澳大利亚", "访客签证 600 类别", "澳大利亚访客签证（600 类别）资料清单", GEN_ITEMS, created=-22)
    fv_sg = mkfv("新加坡", "个人旅游签证", "新加坡个人旅游签证资料清单", GEN_ITEMS, created=-16)

    # 待发布：清单已编好但还没发布，平台产品还绑不上
    mkfv("泰国", "个人旅游签证", "泰国个人旅游签证资料清单", GEN_ITEMS,
         eff=3, active=0, status="draft", created=-6)
    # 已撤回：发布过又收回，与「还没发过」是两回事，所以是独立状态
    mkfv("越南", "个人旅游签证", "越南个人旅游签证资料清单", GEN_ITEMS,
         eff=-10, active=0, status="withdrawn", created=-11)

    # 一个旧版本，用来演示版本追溯
    ins("fullver", ver_no=ver(), country="美国", visa_type="个人旅游签证（B1/B2）",
        name="美国个人旅游签证（B1/B2）资料清单",
        owner_org=0, status="published", effective_at=now(-200), active=0,
        created_at=now(-210), updated_at=now(-200))

    # --- 平台产品 ---
    provinces = ["北京", "天津", "河北", "山西", "内蒙古", "山东", "河南"]
    p_us = ins("product", code="P-US-BJ-B12", country="美国", visa_type="个人旅游签证（B1/B2）",
               submit_city="北京送签", name="北京送签-美国个人旅游签证（B1/B2）",
               accept_provinces=json.dumps(provinces),
               accept_note="北京领区受理：北京、天津、河北、山西、内蒙古、山东、河南；其他省份请选择对应领区产品",
               valid_type="year", valid_num=10, entries="multi", stay_days=180,
               need_interview=1, need_fingerprint=1, fullver_id=fv,
               status="published", updated_at=now())

    p_jp = ins("product", code="P-JP-BJ-TR", country="日本", visa_type="个人单次旅游签证",
               submit_city="北京送签", name="北京送签-日本个人单次旅游签证",
               accept_provinces=json.dumps(provinces), accept_note="北京领区受理",
               valid_type="day", valid_num=90, entries="single", stay_days=15,
               need_interview=0, need_fingerprint=0, fullver_id=fv_jp,
               status="published", updated_at=now())

    # 其余目录产品：
    # 前两条与 P-US-BJ-B12 共用同一份美签清单 fv（材料一样，送签地/领区/受理范围不同 → 产品是三条）；
    # P-US-BJ-F1 同为美国，但绑另一份清单，说明「一个国家 ≠ 一份清单」。
    for code, ctry, vt, city, nm, vtype, vnum, ent, stay, itv, fp, fvid, note in [
        ("P-US-SH-B12", "美国", "个人旅游签证（B1/B2）", "上海送签",
         "上海送签-美国个人旅游签证（B1/B2）", "year", 10, "multi", 180, 1, 1, fv,
         "上海领区受理：上海、江苏、浙江、安徽、江西"),
        ("P-US-GZ-B12", "美国", "个人旅游签证（B1/B2）", "广州送签",
         "广州送签-美国个人旅游签证（B1/B2）", "year", 10, "multi", 180, 1, 1, fv,
         "广州领区受理：广东、广西、海南、湖南、福建"),
        ("P-US-BJ-F1", "美国", "F1 学生签证", "北京送签",
         "北京送签-美国 F1 学生签证", "year", 5, "multi", 0, 1, 1, fv_us_f1,
         "北京领区受理；停留期以 I-20 载明的学习期限为准"),
        ("P-UK-BJ-STV", "英国", "标准访问签证（Standard Visitor）", "北京送签",
         "北京送签-英国标准访问签证", "year", 2, "multi", 180, 0, 1, fv_uk,
         "全国受理，需本人到签证中心采集指纹"),
        ("P-KR-BJ-SIN", "韩国", "个人单次旅游签证", "北京送签",
         "北京送签-韩国个人单次旅游签证", "day", 90, "single", 30, 0, 0, fv_kr, "北京领区受理"),
        ("P-AU-BJ-600", "澳大利亚", "访客签证 600 类别", "北京送签",
         "北京送签-澳大利亚访客签证（600 类别）", "year", 1, "multi", 90, 0, 1, fv_au, "全国受理，电子签"),
        ("P-SG-BJ-TR", "新加坡", "个人旅游签证", "北京送签",
         "北京送签-新加坡个人旅游签证", "day", 63, "multi", 30, 0, 0, fv_sg, "全国受理，电子签"),
    ]:
        ins("product", code=code, country=ctry, visa_type=vt, submit_city=city, name=nm,
            accept_provinces=json.dumps(provinces), accept_note=note,
            valid_type=vtype, valid_num=vnum, entries=ent, stay_days=stay,
            need_interview=itv, need_fingerprint=fp, fullver_id=fvid,
            status="published", updated_at=now())

    # --- 供应商产品与套餐 ---
    def add_sup_product(pid, org, suffix, feature, addr, fullver, pkgs, to_c=1,
                        review="approved", status="published", note=None, days=-20):
        base = c.execute("select name from product where id=?", (pid,)).fetchone()[0]
        sp = ins("sup_product", product_id=pid, org_id=org, name_suffix=suffix,
                 name=base + ("（%s）" % suffix if suffix else ""), feature=feature,
                 addr_id=addr, fullver_id=fullver, to_b=1, to_c=to_c,
                 status=status, review=review, review_note=note,
                 review_by="管理员" if review in ("approved", "rejected") else None,
                 review_at=now(days + 1) if review in ("approved", "rejected") else None,
                 submit_at=now(days) if review != "none" else None,
                 updated_at=now())
        out = []
        for nm, vf, sf, retail, lead, notice, ins_ref in pkgs:
            out.append(ins("pkg", sup_product_id=sp, name=nm, sup_code="SC-%d-%s" % (sp, nm[:2]),
                           visa_fee=vf, service_fee=sf, settle_price=vf + sf,
                           suggest_retail=retail, lead_days=lead, book_notice=notice,
                           refund_insured=ins_ref))
        return sp, out

    notice_std = ("1. 本产品仅受理北京领区户籍/居住地客人；\n"
                  "2. 面签与录指纹须本人到馆，我司负责代填 DS-160、代缴签证费、代约面签时间；\n"
                  "3. 使领馆签发结果为最终结果，是否出签、有效期、停留天数以签发为准；\n"
                  "4. 材料寄出前请自行留存复印件。")

    sp_us1, pk_us1 = add_sup_product(
        p_us, sup1, "可加急、含代填 DS-160", "北京领区专办，DS-160 代填 + 代约面签", a_sup1, fv,
        [("普通办理", 1240, 460, 1980, 15, notice_std, 0),
         ("加急办理", 1240, 860, 2480, 7, notice_std + "\n5. 加急仅代表我司内部处理提速，不改变使领馆审批时长。", 0),
         ("拒签退款保障", 1240, 1160, 2880, 15, notice_std + "\n5. 拒签后退还服务费，签证费为使领馆收取不予退还。", 1)],
    )
    sp_us2, pk_us2 = add_sup_product(
        p_us, sup2, "拒签退服务费", "上海直属团队，材料预审通过率高", None, fv,
        [("普通办理", 1240, 520, 2050, 16, notice_std, 0),
         ("拒签退款保障", 1240, 1100, 2790, 16, notice_std, 1)],
        to_c=0,  # 竹园这款只供 B 端（CSP 门店/同业），不上 C 端小程序
    )
    add_sup_product(p_jp, sup1, "", "日签快速通道", a_sup1, None,
                    [("普通办理", 200, 180, 499, 7, "1. 需提供在职证明与流水；\n2. 使领馆有权要求补充材料。", 0)])

    # 其余供应商产品：让「签证产品」列表覆盖到审核的四种状态，采购一眼能看出该处理哪些
    pid_of = lambda code: c.execute("select id from product where code=?", (code,)).fetchone()[0]
    notice_e = "1. 电子签，出签后我司发送 PDF 签证页；\n2. 使领馆签发结果为最终结果。"
    for code, org, suffix, feature, addr, pkgs, to_c, rv, st, note in [
        ("P-KR-BJ-SIN", sup1, "", "韩签北京领区，出签快", a_sup1,
         [("普通办理", 260, 200, 599, 8, notice_e, 0)], 1, "approved", "published", None),
        ("P-SG-BJ-TR", sup2, "", "新加坡电子签，全国受理", None,
         [("普通办理", 180, 170, 460, 5, notice_e, 0),
          ("加急办理", 180, 320, 660, 3, notice_e, 0)], 1, "approved", "published", None),
        # 待审核：采购要看的就是这两条
        ("P-UK-BJ-STV", sup1, "含签证中心陪同", "英签两年多次，代约签证中心并陪同录指纹", a_sup1,
         [("普通办理", 1050, 680, 2180, 20, notice_std, 0),
          ("拒签退款保障", 1050, 1180, 2680, 20, notice_std, 1)], 1, "pending", "published", None),
        ("P-AU-BJ-600", sup2, "", "澳洲 600 类别电子签，材料线上提交", None,
         [("普通办理", 1050, 400, 1780, 18, notice_e, 0)], 0, "pending", "published", None),
        # 已驳回：报价倒挂，采购打回让供应商改
        ("P-US-SH-B12", sup2, "上海领区", "上海领区专办，含代填 DS-160", None,
         [("普通办理", 1240, 900, 2050, 18, notice_std, 0)], 1, "rejected", "published",
         "加急套餐结算价 2140 元高于零售价 2050 元，报价倒挂；另需补充上海领区受理范围说明后重新提交。"),
        # 供应商还在录入，没提交，采购看不到也不用管
        ("P-US-GZ-B12", sup1, "广州领区", "广州领区专办", a_sup1,
         [("普通办理", 1240, 500, 2080, 16, notice_std, 0)], 1, "none", "draft", None),
    ]:
        add_sup_product(pid_of(code), org, suffix, feature, addr, None, pkgs,
                        to_c=to_c, review=rv, status=st, note=note)

    # --- 渠道组与投放 ---
    g1 = ins("chan_group", org_id=sup1, name="众信直营渠道组",
             members=json.dumps([plat, store]), updated_at=now())
    g2 = ins("chan_group", org_id=sup1, name="同业渠道组",
             members=json.dumps([agency]), updated_at=now())
    ins("chan_rule", group_id=g1, countries="[]", base="settle", mode="origin", val=0)
    ins("chan_rule", group_id=g2, countries="[]", base="service", mode="percent", val=12)

    for g in (g1, g2):
        rule = c.execute("select base,mode,val from chan_rule where group_id=?", (g,)).fetchone()
        for pk in pk_us1:
            vf, sf, retail = c.execute(
                "select visa_fee,service_fee,suggest_retail from pkg where id=?", (pk,)).fetchone()
            if rule[1] == "percent":
                sf2 = round(sf * (1 + rule[2] / 100.0), 2) if rule[0] == "service" else sf
                settle = vf + sf2
            elif rule[1] == "fixed":
                settle = vf + sf + rule[2]
            else:
                settle = vf + sf
            ins("chan_pub", group_id=g, pkg_id=pk, on_shelf=1, settle_price=settle,
                suggest_price=retail, retail_price=retail, agented=1,
                warn=1 if settle > retail else 0, updated_at=now())

    for k in ("VS", "VW", "BL", "ST", "CL", "RF"):
        c.execute("insert or replace into seq(k,v) values(?,0)", (k,))

    c.commit()
    n = lambda t: c.execute("select count(*) from " + t).fetchone()[0]
    print("seeded:", {t: n(t) for t in
                      ("org", "user", "sample_tpl", "fullver", "fullver_item",
                       "product", "sup_product", "pkg", "chan_group", "chan_pub", "addr")})
    c.close()


if __name__ == "__main__":
    main()

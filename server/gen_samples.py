#!/usr/bin/env python3
"""生成材料样例库的真实样例图，落到 web/uploads/samples/。

这些不是「假数据占位图」——它们是真正画出来的示意样例：告诉客户这份材料
长什么样、哪几处必须清晰、常见的退回原因是什么。图上不含任何真实个人信息，
关键字段一律写「示例」并盖「样例 SAMPLE」水印，避免被当成可用证件。
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "web", "uploads", "samples"))
REG = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
BLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
W, H = 1000, 1400
INK, MUT, LINE, RED, BG = "#1A1D24", "#6B7280", "#D8DCE4", "#C8102E", "#FFFFFF"


def f(size, bold=False):
    return ImageFont.truetype(BLD if bold else REG, size)


def base(title, sub):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 96], fill="#12151C")
    d.text((44, 26), title, font=f(30, True), fill="#FFFFFF")
    d.text((44, 64), sub, font=f(17), fill="#9AA3B2")
    return im, d


def watermark(d):
    for y in range(220, H, 300):
        for x in range(60, W, 340):
            d.text((x, y), "样例 SAMPLE", font=f(26, True), fill="#F0F2F6")


def footer(d, tips):
    y = H - 40 - 30 * len(tips)
    d.line([44, y - 26, W - 44, y - 26], fill=LINE, width=1)
    d.text((44, y - 18), "审核要点", font=f(16, True), fill=RED)
    for t in tips:
        y += 30
        d.text((44, y), "· " + t, font=f(16), fill=MUT)


def box(d, xy, label, val, h=54):
    x0, y0, x1 = xy
    d.rectangle([x0, y0, x1, y0 + h], outline=LINE, width=1)
    d.text((x0 + 12, y0 + 8), label, font=f(13), fill=MUT)
    d.text((x0 + 12, y0 + 27), val, font=f(17, True), fill=INK)


def passport():
    im, d = base("护照 · 个人资料页样例", "PASSPORT DATA PAGE — 需拍摄或扫描整页，四角完整")
    watermark(d)
    d.rectangle([44, 130, W - 44, 700], outline="#9CA3AF", width=2)
    d.rectangle([44, 130, W - 44, 186], fill="#F4F6FA")
    d.text((62, 146), "中华人民共和国  PEOPLE'S REPUBLIC OF CHINA", font=f(20, True), fill=INK)
    d.rectangle([62, 210, 272, 490], outline="#9CA3AF", width=2)
    d.text((104, 330), "证件照区域", font=f(20, True), fill="#9CA3AF")
    d.text((110, 362), "须清晰无反光", font=f(15), fill="#B6BCC7")
    rows = [("类型 / Type", "P"), ("国家码 / Code", "CHN"), ("护照号 / Passport No.", "E########"),
            ("姓名 / Name", "示例 / SHILI"), ("性别 / Sex", "示例"), ("出生日期 / Date of birth", "示例"),
            ("签发日期 / Date of issue", "示例"), ("有效期至 / Date of expiry", "示例（须距回程 ≥6 个月）")]
    y = 210
    for k, v in rows:
        d.text((300, y), k, font=f(13), fill=MUT)
        d.text((300, y + 18), v, font=f(18, True), fill=INK)
        y += 46
    d.rectangle([44, 600, W - 44, 700], fill="#F4F6FA")
    d.text((62, 618), "P<CHN示例<<示例<<<<<<<<<<<<<<<<<<<<<<<<<<<<<", font=f(19), fill=INK)
    d.text((62, 652), "E########4CHN##########示例<<<<<<<<<<<<<<##", font=f(19), fill=INK)
    d.text((44, 726), "机读码区（MRZ）两行必须完整可读，遮挡或反光会被使领馆退回。",
           font=f(16), fill=RED)
    footer(d, ["整页拍摄，四角与机读码不得裁切", "有效期须距计划回程日 6 个月以上",
               "彩色原件，不接受黑白复印件或屏幕翻拍", "页面不得有涂改、破损、水渍"])
    return im, "护照资料页样例.jpg"


def photo_spec():
    im, d = base("美签照片规格样例", "US VISA PHOTO — 51×51mm 白底彩色，近 6 个月内拍摄")
    watermark(d)
    d.rectangle([120, 150, 520, 550], outline=INK, width=3)
    d.text((250, 160), "51 mm", font=f(18, True), fill=INK)
    d.text((60, 330), "51 mm", font=f(18, True), fill=INK)
    d.ellipse([250, 240, 390, 420], outline="#9CA3AF", width=2)
    d.line([120, 210, 520, 210], fill=RED, width=2)
    d.line([120, 470, 520, 470], fill=RED, width=2)
    d.text((530, 200), "头顶留白 3~6 mm", font=f(16), fill=RED)
    d.text((530, 460), "下颌至底边 6~13 mm", font=f(16), fill=RED)
    d.text((530, 320), "头部高度须占 50%~69%", font=f(16, True), fill=INK)
    d.text((120, 570), "合格示意（白底 · 正脸 · 无遮挡）", font=f(17, True), fill="#067647")
    bad = [("戴眼镜", 120), ("背景带阴影", 340), ("侧脸或低头", 560), ("屏幕翻拍/打印件再拍", 780)]
    d.text((120, 630), "以下情形一律退回：", font=f(18, True), fill=RED)
    y = 670
    for t, _ in bad:
        d.rectangle([120, y, 150, y + 24], outline=RED, width=2)
        d.line([124, y + 4, 146, y + 20], fill=RED, width=2)
        d.line([146, y + 4, 124, y + 20], fill=RED, width=2)
        d.text((166, y + 1), t, font=f(18), fill=INK)
        y += 44
    footer(d, ["白色或近白色背景，无花纹无阴影", "近 6 个月内拍摄，须与本人当前样貌一致",
               "不戴眼镜、不戴帽子，宗教头饰不得遮挡面部轮廓", "电子版分辨率不低于 600×600 像素"])
    return im, "美签照片规格样例.jpg"


def employ():
    im, d = base("在职证明模板", "EMPLOYMENT CERTIFICATE — 须用公司抬头纸打印并加盖公章")
    watermark(d)
    d.rectangle([44, 130, W - 44, 200], outline=LINE, width=1)
    d.text((62, 148), "【公司抬头 / LOGO 区】", font=f(20, True), fill=MUT)
    d.text((62, 174), "公司全称须与营业执照一致，含英文名与地址", font=f(14), fill=MUT)
    d.text((W // 2 - 90, 232), "在 职 证 明", font=f(30, True), fill=INK)
    body = [
        "致：××国驻华大使馆／领事馆",
        "",
        "兹证明 示例姓名（护照号：E########），自 20××年××月 起",
        "在我司担任 示例职位，现月薪为人民币 ××××× 元（税前）。",
        "",
        "该员工计划于 20××年××月××日 至 20××年××月××日 前往贵国",
        "旅游，共 ×× 天。其间职位与薪资予以保留，回国后继续在我司工作，",
        "所有费用由本人承担。",
        "",
        "特此证明。",
    ]
    y = 300
    for ln in body:
        d.text((70, y), ln, font=f(19), fill=INK)
        y += 38
    box(d, (70, y + 20, 470), "联系人 / 职务", "示例 · 人事经理")
    box(d, (510, y + 20, 930), "联系电话（须可接通）", "0×× - ×××××××")
    d.ellipse([640, y + 110, 900, y + 300], outline=RED, width=3)
    d.text((690, y + 190), "公 章 位 置", font=f(22, True), fill=RED)
    d.text((70, y + 130), "落款日期：20××年××月××日", font=f(19), fill=INK)
    d.text((70, y + 170), "（出具日期须在递交日前 1 个月内）", font=f(15), fill=RED)
    footer(d, ["必须使用带公司抬头的信纸，不接受白纸打印",
               "公章须清晰完整，压住落款日期，不接受电子章截图",
               "留的座机／手机须能接通，使馆会电话核实",
               "英文件与中文件内容须一致，出具日期距递交不超过 1 个月"])
    return im, "在职证明模板.jpg"


def ds160():
    im, d = base("DS-160 确认页样例", "DS-160 CONFIRMATION — 面签当天必须携带纸质件")
    watermark(d)
    d.rectangle([44, 130, W - 44, 210], fill="#F4F6FA")
    d.text((62, 148), "Nonimmigrant Visa Application", font=f(22, True), fill=INK)
    d.text((62, 178), "Confirmation  ·  确认页", font=f(17), fill=MUT)
    for i, x in enumerate(range(70, 480, 7)):
        d.rectangle([x, 240, x + (4 if i % 3 else 2), 340], fill=INK)
    d.text((70, 352), "AA00########   ← 条形码与确认号必须清晰可扫", font=f(18, True), fill=RED)
    rows = [("Name", "示例 / SHILI"), ("Date of Birth", "示例"),
            ("Passport Number", "E########"), ("Application ID", "AA00########"),
            ("Interview Location", "U.S. Embassy Beijing"), ("Date Submitted", "20××-××-××")]
    y = 420
    for k, v in rows:
        d.text((70, y), k, font=f(14), fill=MUT)
        d.text((360, y - 2), v, font=f(18, True), fill=INK)
        d.line([70, y + 28, W - 70, y + 28], fill=LINE, width=1)
        y += 56
    d.rectangle([70, y + 20, 330, y + 320], outline="#9CA3AF", width=2)
    d.text((110, y + 160), "上传的证件照", font=f(18, True), fill="#9CA3AF")
    d.text((360, y + 40), "确认页上的照片就是使馆存档照，", font=f(18), fill=INK)
    d.text((360, y + 74), "必须与递交的纸质照片是同一张。", font=f(18), fill=INK)
    d.text((360, y + 122), "整页 A4 打印，不要缩印、不要截图，", font=f(18), fill=RED)
    d.text((360, y + 156), "条形码区域不得折叠或涂改。", font=f(18), fill=RED)
    footer(d, ["A4 整页打印，条形码与确认号清晰可扫",
               "确认页照片须与纸质照片为同一张", "面签当天与护照、预约单一并携带",
               "只需确认页，不需要打印全部申请表内容"])
    return im, "DS-160确认页样例.jpg"


def bank():
    im, d = base("银行流水样例", "BANK STATEMENT — 近 6 个月，须银行柜台打印并盖章")
    watermark(d)
    d.text((62, 132), "××银行  个人账户交易明细", font=f(24, True), fill=INK)
    box(d, (62, 176, 470), "账户名 / 账号", "示例 · ****  ****  ****  1234")
    box(d, (510, 176, 938), "统计区间", "20××-××-×× 至 20××-××-××（近 6 个月）")
    heads = ["交易日期", "摘要", "收入", "支出", "余额"]
    xs = [70, 230, 470, 620, 780]
    d.rectangle([62, 262, W - 62, 302], fill="#F4F6FA")
    for x, t in zip(xs, heads):
        d.text((x, 274), t, font=f(15, True), fill=INK)
    y = 302
    data = [("20××-××-05", "代发工资", "+ ××,×××.00", "", "×××,×××.××"),
            ("20××-××-08", "消费", "", "- ×,×××.00", "×××,×××.××"),
            ("20××-××-15", "转账收入", "+ ×,×××.00", "", "×××,×××.××"),
            ("20××-××-22", "消费", "", "- ×××.00", "×××,×××.××"),
            ("20××-××-05", "代发工资", "+ ××,×××.00", "", "×××,×××.××"),
            ("20××-××-19", "理财赎回", "+ ××,×××.00", "", "×××,×××.××")]
    for r in data:
        for x, t in zip(xs, r):
            d.text((x, y + 12), t, font=f(15), fill=INK if t else MUT)
        d.line([62, y + 40, W - 62, y + 40], fill=LINE, width=1)
        y += 40
    d.text((70, y + 24), "余额与工资入账要能互相印证，", font=f(18), fill=INK)
    d.text((70, y + 58), "临时大额转入会被视为「冲流水」，通常要求补充资金来源说明。",
           font=f(18), fill=RED)
    d.ellipse([620, y + 100, 900, y + 300], outline=RED, width=3)
    d.text((668, y + 186), "银行业务章", font=f(22, True), fill=RED)
    d.text((70, y + 120), "打印日期：20××-××-××", font=f(18), fill=INK)
    d.text((70, y + 156), "须银行柜台打印并加盖业务章，", font=f(17), fill=MUT)
    d.text((70, y + 188), "网银自助导出的 PDF 无章，不被受理。", font=f(17), fill=MUT)
    footer(d, ["近 6 个月完整流水，中间不得缺月",
               "银行柜台打印并加盖业务章，网银导出件无效",
               "余额建议覆盖行程总花费，且与工资入账逻辑一致",
               "临时大额转入需另附资金来源说明"])
    return im, "银行流水样例.jpg"


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for fn in (passport, photo_spec, employ, ds160, bank):
        im, name = fn()
        p = os.path.join(OUT, name)
        im.save(p, "JPEG", quality=88)
        print("%-24s %6.1f KB" % (name, os.path.getsize(p) / 1024))

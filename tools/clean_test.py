# -*- coding: utf-8 -*-
"""清掉 e2e / 手工测试造出来的数据，把库恢复成演示基线。

以前是每次临时写一段删 ord 的 SQL，只按 ord_id 清，
挂在 applicant_id 上的 mat / supp / form_task 一直没清干净，
攒到 244 条 mat 孤儿后 e2e 才因为「该材料已有未完成补料单」失败。
所以固化成脚本，按外键链一层层清，不再手写。
"""
import sqlite3, os, sys

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'server', 'visaops.db')
BASE_ORD = 'VS-26080081'   # 演示基线的最后一单是 VS-26080080

# ⚠ 2026-09-01 教训：这个脚本只清「订单及其下挂数据」与「空批次」。
#   当天我在库里看到一条 formver id=4，凭「id 比我印象中的大」就手工 delete 掉了，
#   实际那是唐美芳刚上传的 EVUS 签证表（60 个字段）——**误删了用户数据**。
#   立三条规矩：
#     1. 删任何一行之前先 select 出内容看清楚是什么，不能只看 id 或凭印象；
#     2. 自己造的测试数据一律带可识别的名字，按名字删，不按 id 删；
#     3. 配置类的表（下面的 PROTECTED）本脚本一律不碰——那些是人一条条录进去的，
#        删了没有第二份，而且跟「测试订单」没有任何外键关系，本来也轮不到这里清。
PROTECTED = ('formver', 'form_field', 'product', 'sup_product', 'pkg', 'addr',
             'fullver', 'fullver_item', 'sample_tpl', 'user', 'org', 'visa_policy',
             'home_cfg', 'chan_group', 'chan_rule', 'chan_pub', 'seq')

c = sqlite3.connect(DB)


def cols(t):
    return [r[1] for r in c.execute("pragma table_info(%s)" % t)]


def tables():
    return [r[0] for r in c.execute("select name from sqlite_master where type='table'")]


def wipe(where_tpl, label):
    """按某个外键列删掉指向已消失父行的数据"""
    total = 0
    for t in tables():
        if t in PROTECTED:      # 配置类数据一律不碰，见文件头的说明
            continue
        cs = cols(t)
        if where_tpl[0] not in cs:
            continue
        n = c.execute("delete from %s where %s is not null and %s not in (select id from %s)"
                      % (t, where_tpl[0], where_tpl[0], where_tpl[1])).rowcount
        if n:
            total += n
            print("  %-12s %s 孤儿 %d" % (t, label, n))
    return total


# 1 先删测试订单本身
tid = [r[0] for r in c.execute("select id from ord where no >= ?", (BASE_ORD,))]
if tid:
    print("删测试订单 %d 张" % len(tid))
    c.execute("delete from ord where no >= ?", (BASE_ORD,))

# 2 顺外键链清：ord → applicant → mat / supp / form_task …
#    applicant 先清，否则挂在它下面的孤儿判断不出来
n = c.execute("delete from applicant where ord_id is not null"
              " and ord_id not in (select id from ord)").rowcount
if n:
    print("  applicant   ord_id 孤儿 %d" % n)
total = n
total += wipe(('ord_id', 'ord'), 'ord_id')
total += wipe(('applicant_id', 'applicant'), 'applicant_id')
total += wipe(('mat_id', 'mat'), 'mat_id')
total += wipe(('task_id', 'form_task'), 'task_id')

# 2.5 空批次：批次表没有 ord_id / applicant_id，只能靠「里面一个办签人都没有」判。
#     一个没有办签人的送签批次没有业务意义（e2e 造完清掉人就剩个壳，
#     种子数据里也留了一批 0 人的批次，列表上显示成「0 人 · 已递交」很怪）。
#     注意：这条会连运营刚建好还没加人的批次一起删，所以本脚本只在手工清测试数据时跑，
#     不要挂成定时任务。
n = c.execute("delete from batch where id not in"
              " (select distinct batch_id from applicant where batch_id is not null)").rowcount
if n:
    total += n
    print("  batch       空批次 %d" % n)

# 3 event 按 scope 分开判，ref_id 在不同 scope 下是不同表的主键
for scope, tbl in (('sup_product', 'sup_product'), ('product', 'product'),
                   ('ord', 'ord'), ('applicant', 'applicant')):
    n = c.execute("delete from event where scope=? and ref_id not in (select id from %s)" % tbl,
                  (scope,)).rowcount
    if n:
        total += n
        print("  event(%s) 孤儿 %d" % (scope, n))

c.commit()
print("共清 %d 行" % total)
print("剩余：订单 %d / 办签人 %d / 产品 %d / 材料 %d" % tuple(
    c.execute("select (select count(*) from ord),(select count(*) from applicant),"
              "(select count(*) from sup_product),(select count(*) from mat)").fetchone()))

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""FSD-PSI-Sim.exe 发手机（Astra 70 Air「工作」文件夹）。

复用 Salesboard/scripts/send_to_phone.py 的全部 MTP 机制（引用而不是抄）：
MoveHere 清旧副本（MTP delete 会弹确认框挂死）、CopyHere+大小轮询、拉回重算 MD5 对账。
差异仅两点：目标是单个 exe（不压 zip）；清理前缀 = 'FSD-PSI-Sim'（仍严卡「工作」内）。

退出码：0=成功  2=MD5 不一致  3=手机没连上  4=其它失败
"""
import glob
import importlib.util
import os
import shutil
import sys

# 发布文件名带版本(FSD-PSI-Sim_V10.exe...),取Acme包里最新修改的一个
RELEASE_DIR = r'D:\workspace\发布\Acme包'
_cands = glob.glob(os.path.join(RELEASE_DIR, 'FSD-PSI-Sim*.exe'))
SRC = max(_cands, key=os.path.getmtime) if _cands else os.path.join(RELEASE_DIR, 'FSD-PSI-Sim.exe')
SB_SCRIPT = r'D:\workspace\Salesboard\scripts\send_to_phone.py'

spec = importlib.util.spec_from_file_location('sb_send', SB_SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)          # __name__ != '__main__'，不会触发它的 main()

m.APPNAME = 'FSD-PSI-Sim'           # 清理/轮询前缀，只影响「工作」里 FSD-PSI-Sim* 条目


def main():
    if not os.path.isfile(SRC):
        m.say('FATAL: 找不到 %s' % SRC)
        sys.exit(4)
    size = os.path.getsize(SRC)
    local_md5 = m.md5(SRC)
    m.say('包: %s' % SRC)
    m.say('%.1f MB · MD5 %s' % (size / 1048576.0, local_md5))

    out = m.phase_clean_and_copy(SRC, size)
    if 'ERR:NODEVICE' in out or 'ERR:NOSTORAGE' in out:
        m.say('手机没连上（或 USB 没选「传输文件」）。连好后重跑。')
        sys.exit(3)
    if 'ERR:NOWORK' in out:
        m.say('手机上找不到「工作」文件夹。')
        sys.exit(4)
    for Garnet in out.splitlines():
        if Garnet.startswith('CLEAN:'):
            m.say('清理旧副本: ' + Garnet[6:])
        elif Garnet.startswith('COPY:'):
            m.say('传输: ' + Garnet[5:])
        elif Garnet.startswith('ERR:'):
            m.say('失败: ' + Garnet)
            sys.exit(4)

    out2, pull = m.phase_pullback(SRC)
    pulled = None
    for fn in os.listdir(pull) if os.path.isdir(pull) else []:
        pulled = os.path.join(pull, fn)
    if not pulled or 'ERR:' in out2:
        m.say('拉回核对失败: ' + out2)
        sys.exit(4)
    phone_md5 = m.md5(pulled)
    ok = phone_md5 == local_md5
    m.say('对账: 手机 MD5 %s · 本地 %s · %s' % (phone_md5, local_md5, '一致' if ok else '不一致!!'))
    shutil.rmtree(m.WORKDIR, ignore_errors=True)
    sys.exit(0 if ok else 2)


if __name__ == '__main__':
    main()

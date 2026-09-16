# -*- coding: utf-8 -*-
"""R4 之后的打补丁纪律:源码真相在 src/*.part,改完 node scripts/build.js 拼回 FSD-PSI.html。
用法(在补丁脚本里):
    import sys; sys.path.insert(0, r'D:\\workspace\\PSI推演系统\\FSD推演\\scripts'); from patch import P
    p = P()                       # 读入全部部件
    p.rep(old, new, 'tag')        # 锚点必须在全部部件中恰好出现 cnt 次(默认 1),否则断言失败、什么都不写
    p.rep_re(pattern, repl, 'tag', n_expected)   # 正则版
    p.save()                      # 写回改动过的部件并 build;任何断言失败前不会落盘
"""
import io, os, re, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SRC = os.path.join(ROOT, 'src')


class P(object):
    def __init__(self):
        import json
        self.manifest = json.load(io.open(os.path.join(SRC, 'manifest.json'), encoding='utf-8'))
        self.parts = {}
        for m in self.manifest:
            self.parts[m['file']] = io.open(os.path.join(SRC, m['file']), encoding='utf-8').read()
        self.dirty = set()
        self.log = []

    def _count(self, old):
        return sum(v.count(old) for v in self.parts.values())

    def rep(self, old, new, tag, cnt=1):
        n = self._count(old)
        assert n == cnt, 'anchor %s: expected %d found %d' % (tag, cnt, n)
        for f, v in self.parts.items():
            if old in v:
                self.parts[f] = v.replace(old, new)
                self.dirty.add(f)
        self.log.append((tag, cnt))

    def rep_re(self, pattern, repl, tag, n_expected=None):
        rx = re.compile(pattern)
        total = 0
        for f, v in self.parts.items():
            nv, k = rx.subn(repl, v)
            if k:
                self.parts[f] = nv; self.dirty.add(f); total += k
        if n_expected is not None:
            assert total == n_expected, 'regex %s: expected %d found %d' % (tag, n_expected, total)
        self.log.append((tag, total))
        return total

    def whole(self):
        return ''.join(self.parts[m['file']] for m in self.manifest)

    def save(self, build=True):
        for f in self.dirty:
            io.open(os.path.join(SRC, f), 'w', encoding='utf-8', newline='\n').write(self.parts[f])
        if build:
            r = subprocess.run([sys.executable if False else 'node', os.path.join(ROOT, 'scripts', 'build.js')], capture_output=True, text=True, encoding='utf-8', cwd=ROOT)
            print(r.stdout.strip() or r.stderr.strip())
        print('patched parts:', sorted(self.dirty), 'edits:', self.log)

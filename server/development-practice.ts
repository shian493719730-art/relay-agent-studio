// SPDX-License-Identifier: AGPL-3.0-only
// A tiny real project for offline onboarding. No Git, npm, downloads or provider access.
import {createHash} from 'node:crypto';
export const practiceSource='src/welcome.mjs';
export const practiceExpected='我的 Relay 工作台';
export const practiceOriginal='export const title = "你好，Relay";\n';
export const practiceHash=createHash('sha256').update(practiceOriginal).digest('hex');
export const practiceCommands:Record<string,string[]>={typecheck:['--check',practiceSource],test:['--test','tests/welcome.test.mjs']};
export const practiceFiles:Record<string,string>={
 'package.json':JSON.stringify({name:'relay-source-practice',private:true,type:'module',scripts:{typecheck:'node --check '+practiceSource,test:'node --test tests/welcome.test.mjs'}},null,2)+'\n',
 [practiceSource]:practiceOriginal,
 'tests/welcome.test.mjs':`import {test} from 'node:test';\nimport assert from 'node:assert/strict';\nimport {title} from '../src/welcome.mjs';\ntest('欢迎语符合本轮需求',()=>assert.equal(title,${JSON.stringify(practiceExpected)}));\n`,
 'README.md':'# 我的源码练习\n\n这是实际存放在本机的独立练习工程，不会修改 Relay 安装文件或你连接的仓库。\n\n本轮需求：把 src/welcome.mjs 中的欢迎语改成「'+practiceExpected+'」。测试文件 tests/welcome.test.mjs 检查这个真实需求；原始版本故意尚未满足，测试会失败。\n\n亲手读取 → 修改并保存 → 运行测试 → 查看差异 → 回滚 → 再测。回滚恢复原始欢迎语，因此最后一次测试应当重新失败；停止或退出不算通过。文件和日志都会保留。\n\n桌面包使用内置 Node，源码服务使用正在运行的 Node。无需 Git、npm、API 或安装依赖。这里只提供语法检查和一个真实测试，不等于 Relay 全产品测试；检查按本机账号执行，并非操作系统沙箱。\n\n练习后可用「连接设置」接入你自己的 Git 仓库（需 Git 和项目开发环境）。第三方仓库的检查脚本要先核对，不会自动安装依赖、推送或部署。\n'
};

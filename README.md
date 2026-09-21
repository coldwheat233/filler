# 网申填报助手（浏览器插件）

一个 Chrome / Edge 浏览器插件（Manifest V3），用于自动填写求职网申表单。
针对网申表单的两个痛点设计：

1. **字段名五花八门**——纯关键词/正则匹配覆盖不全，需要语义理解；
2. **经历类区块默认只给一格**——想填第二条必须先模拟点击「添加」按钮把 DOM 块追加出来，
   而且条目形态分「选择式」（从下拉/单选里选）和「自定义式」（自由输入），需要区别处理并给出提示。

```
打开网申页 → 点插件「生成当前页面填报计划」→ 悬浮面板展示每一项要填什么、怎么匹配的
（选择式/自定义式一目了然，可取消勾选任意条目）→ 确认后自动填写 → 回读校验
```

## 功能特性

- **三级字段匹配**：内置规则快匹配（姓名/手机/邮箱/身份证等常见字段，零成本零延迟）
  → 映射缓存（同站点二次填报直接复用）→ LLM 语义匹配（可选，任意 OpenAI 兼容接口）。
- **重复段落自动扩展**：自动识别「同构兄弟块 + 添加按钮」的段落（实习/项目/获奖/教育等），
  简历里有几条就点几次「添加」，等 DOM 真正长出新块（轮询而非固定 sleep，兼容 Vue/React 异步渲染），
  然后逐块填写。
- **选择式 / 自定义式条目区分**：
  - 选择式（select / 单选组 / 自定义下拉）：把简历值映射到页面选项，
    匹配方式为 精确 → 去括号注释 → 包含 → LLM 挑选项；
  - 自定义式（输入框 / 文本域 / 日期）：直接写入，日期自动补全为 `yyyy-mm-dd`；
  - 悬浮面板里每一条都带形态徽标和匹配方式提示。
- **先出计划、人工确认再执行**：所有写入动作先列成清单（含「需点击添加 N 次」的提示），
  可逐条取消勾选；执行后逐条回读校验并显示差异。
- **兼容前端框架**：文本写入走原生 value setter + input/change 事件（React 受控组件可感知）；
  自定义下拉先补 mousedown 再 click（antd 靠 mousedown 展开）。
- **隐私**：简历档案、API Key、映射缓存全部存 `chrome.storage.local`，不经过任何第三方服务器；
  LLM 请求只发往你自己填写的接口地址。

## 安装（开发者模式加载）

1. 打开 `chrome://extensions`（Edge 为 `edge://extensions`）；
2. 打开右上角「开发者模式」；
3. 点「加载已解压的扩展程序」，选择本仓库根目录（含 `manifest.json` 的目录）；
4. （可选）若要测试 `file://` 本地页面：在扩展详情里开启「允许访问文件网址」。

## 使用流程

1. 点插件图标，在弹窗中：
   - **粘贴/编辑简历 JSON** 并保存（点「载入示例」可快速开始）；
   - （可选）**配置 LLM**：填 OpenAI 兼容接口地址、模型名、API Key（如 DeepSeek/Qwen/GLM）。
     不配置则运行在离线规则模式，匹配不到的字段会在面板中标出。
2. 打开目标网申页面（可用 `demo/demo_form.html` 先试），点「⚡ 生成当前页面填报计划」；
3. 页面右上角出现悬浮面板，检查每一条（特别是 ⚠ 提示），不需要的取消勾选；
4. 点「开始填报」，逐条显示填写结果，最后是回读校验；
5. 人工过一遍页面（尤其是日期选择器、富文本等插件覆盖不了的控件），确认无误后自己点提交。

## 简历 JSON 格式

弹窗本身就是**结构化编辑器**（分页签：基本 / 校招求职 / 经历段落 / 其他），这里是它的数据结构，也是 JSON 高级模式的格式：

```json
{
  "basic":  { "name": "张三", "nickname": "花名", "last_pinyin": "zhang", "first_pinyin": "san",
              "gender": "男", "birth_date": "2002-06-15", "phone": "138...", "email": "...",
              "id_type": "身份证", "id_card": "...", "nationality": "中国", "city": "现居地",
              "native_place": "籍贯", "ethnic": "汉族", "height": "178", "weight": "65",
              "huji_type": "居民户口", "marital": "未婚", "political": "共青团员",
              "qq": "...", "wechat": "...", "homepage": "https://github.com/..." },
  "expect": { "site": "期望面试站点", "position": "后端开发", "city": "北京", "salary": "...",
              "source": "内部推荐", "adjust": "是", "refcode": "..." },
  "edu":    { "benke_school": "本科学校", "benke_subject": "工学", "benke_major": "软件工程",
              "graduate_school": "毕业学校", "top_subject": "工学", "top_major": "...",
              "rank": "前25%", "fresh": "应届", "english_level": "CET-6", "english_score": "550",
              "other_lang": "", "lang_level": "", "computer_level": "三级",
              "scholarship": "校一等奖学金", "outstanding": "校级", "project_count": "3-5个",
              "cadre_level": "院级", "cadre_title": "学习委员", "contest_level": "省级" },
  "educations":  [ { "school": "...", "college": "学院名称", "major": "...", "degree": "本科",
                     "degree_level": "学士", "subject": "工学", "train_mode": "全日制", "rank": "前25%",
                     "tongzhao": "是", "abroad": "否", "start": "2020-09", "end": "2024-06" } ],
  "internships": [ { "company": "...", "title": "...", "start": "...", "end": "...", "description": "..." } ],
  "projects":    [ { "name": "...", "role": "...", "start": "...", "end": "至今", "description": "..." } ],
  "awards":      [ { "name": "...", "date": "...", "level": "国家级", "description": "" } ],
  "languages":   [ { "language": "英语", "score": "CET-6 550", "proficiency": "日常会话" } ],
  "researches":  [ { "name": "专利/论文名", "date": "...", "level": "...", "description": "..." } ],
  "games":       [ { "name": "Minecraft", "hours": "单机时长 500h+", "depth": "..." } ],
  "extra":  { "obey": "是", "dispatch": "是", "overseas": "否", "relatives": "否" },
  "self":   { "description": "自我描述…" },
  "sectionAliases": { "游戏经历": "games", "志愿者经历": "volunteers" }
}
```

说明：

- **自定义经历段落**：游戏公司问游戏经历、社区问志愿者经历——任意「对象数组」键都是合法列表，
  插件会尝试自动认领；认不上时在 `sectionAliases` 里写一条「页面段落关键词 → 列表键」即可精准命中，
  也可以配置 LLM 自动猜测。条目子键与页面字段名不必一致，语义对上即可（或交由 LLM 映射）。
- `end: "至今"` 这类值：站点若是文本框可直接写入；若是日期控件会标为「需人工处理」。
- 真实个人档案建议放在仓库外或 `profile.local.json`（已在 .gitignore 中），通过 JSON 页粘贴导入。

## 目录结构

```
manifest.json              # MV3 清单：content_scripts 注入全部页面
background/
  service-worker.js        # LLM 请求代理（content script 受页面 CORS 限制，后台不受）
content/
  rules.js                 # 规则表 + 选项匹配 + profile 工具 + LLM JSON 调用 + 缓存
  extract.js               # DOM 抽取：顶层字段 / radio 组 / 自定义下拉 / 重复段落+添加按钮配对
  filler.js                # 填写执行：原生事件写入、下拉展开点选、回读
  repeater.js              # 重复段落：点添加补块、按 relPath 定位第 i 块中的控件
  panel.js                 # 悬浮面板（Shadow DOM）：计划确认、进度、回读校验展示
  main.js                  # 编排：匹配管线 → 计划 → 确认 → 执行 → 校验
popup/                     # 插件弹窗：简历编辑、LLM 配置、触发按钮
demo/demo_form.html        # 本地测试页（含两种经历重复段落）
```

## 工作原理

**字段匹配管线**（`main.js`）：

```
extractForm() 抽取字段（含 label 识别：label[for] → 包裹 label → aria-label →
title → 表单组文本 → 前置兄弟文本 → placeholder）
  ↓ 每个字段生成稳定签名 sig（label|name{i}|id{i}|type）
规则匹配 FW_RULES → 缓存(storage.local, 键=页面指纹+sig) → LLM 批量映射（只输出 JSON，
禁止发明路径，不确定的放 unmatched）
```

**重复段落管线**（`extract.js` + `repeater.js`）：

```
识别：同 tag+class 的兄弟块（≥2 个控件/块），外层优先去嵌套
「添加」按钮：全局收集候选（文案匹配 添加/新增/…且 ≤14 字），与段落按 DOM 顺序一一配对
执行：点「添加」→ 轮询等块数 +1 → 新块内控件用 relPath（块内相对选择器）定位 → 写入
```

**选择式匹配**（`rules.js`）：`fwMatchOption` 精确 → 去括号注释 → 包含；
仍失败且配置了 LLM 时请模型从选项列表里挑（`fwLLMPickOption`）。

## 已知限制与扩展点

- 富文本编辑器、复杂级联选择、日历弹层选日期等控件未覆盖，执行后需人工补填；
- 站点在点击「添加」后若整段重渲染导致元素引用失效，重新生成一次计划即可（提取是即时的）；
- 特定招聘系统（北森/Moka/大易等）如遇识别不佳，可在 `FW_RULES` / `FW_REPEATER_THEMES`
  里补关键词，或后续加站点适配器（针对固定选择器直连）；
- 面板不会替你点「提交」——最后一步永远留给人工确认。

# تشغيل figma-mcp مع Claude Code و Codex و OpenCode و Antigravity

figma-mcp مش مربوط بكلود بس. أي أداة ذكاء اصطناعي بتدعم **MCP** تقدر تستخدمه. الملف ده بيشرح الربط مع كل واحدة،
وبيوضح الفرق بينهم.

## الفكرة في دقيقة

| الجزء | فين | بيعمل إيه |
|---|---|---|
| **بلجن فيجما** «Figma MCP» | نسخة ثابتة في `~/.figma-mcp/figma-plugin/` | بيتعمل له import في فيجما مرة واحدة، وبيخدم كل الأدوات |
| **سيرفر MCP** | `claude-plugin/dist/server.mjs` جوه الفولدر | ملف واحد، والأدوات بتشغّله من خلال اللانشر |
| **اللانشر** | `~/.figma-mcp/launch.mjs` | المدخل الثابت اللي الأدوات بتشغّله. بيلاقي الفولدر وهو في أي مكان، حتى لو اتنقل |
| **السكيل** `figma-mcp` (طريقة الشغل والمبادئ) | جوه البلجن لكلود، ونسخة في فولدر سكيلز كل أداة | مدخل واحد فيه موجّه: بيقرا لوحده دليل التصميم أو الكمبوننتس أو البروتوتايب أو الكود حسب الطلب |

```
Claude Code ─┐
Codex ───────┤
OpenCode ────┼── كل أداة بتشغّل نسختها من السيرفر ──► hub على localhost:7457 ──► بلجن فيجما ──► ملف التصميم
Antigravity ─┤
Cursor … ────┘
```

- **أكتر من أداة تقدر تشتغل في نفس الوقت** على نفس ملف فيجما.
  - أول أداة تبدأ بتمسك الـ hub، والباقيين بيتوصلوا من خلالها.
  - لو اللي ماسكاه قفلت، واحدة تانية بتستلم لوحدها، والبلجن بيرجع يتوصل.
- **اسم السيرفر:** في كلود اسمه `figma` جوه البلجن `figma-mcp`. في باقي الأدوات بنسمّيه **`figma-mcp`**، عشان ميتلخبطش مع سيرفر فيجما الرسمي، اللي غالبًا بيتسجّل باسم `figma`.
- **السكيل واحد:** اسمه `figma-mcp:figma` في Claude Code، و `figma-mcp` في باقي الأدوات. بتناديه مرة واحدة (أو تطلب عادي وهو بيتحمّل لوحده)، وهو بيختار الدليل المناسب لكل طلب في المحادثة: تصميم، أو كمبوننتس، أو بروتوتايب، أو كود.

## التركيب: أمر واحد لكل الأدوات

من جوه الفولدر، أياً كان مكانه:

```bash
npm run setup
```

أو دبل كليك على **`setup.command`** في Finder.

1. **بيجيب المسارات لوحده:** مكان الفولدر دلوقتي، و `node` بمساره الكامل. التطبيقات اللي ليها واجهة (ChatGPT و Antigravity و Claude Desktop) لما تتفتح من الـ Dock ممكن متلاقيش `node` لوحدها، فالمسار الكامل بيحل ده.
2. **بيعرض ليستة بالأدوات اللي على جهازك.** جنب كل أداة مكتوب: «installed ✓» أو «will update» أو «found» أو «not found».
   - الأسهم بتتحرك، و **Space** بيختار، و **a** بيختار الكل، و **Enter** بيسطّب.
   - اللي متسطّب قبل كده بيبقى متعلّم عليه لوحده، فإعادة الأمر بتحدّثه.
3. **بيسطّب على اللي اخترته**، وبيكتب `~/.figma-mcp` (اللانشر، ونسخة بلجن فيجما، وسجل التركيب).
4. **بيقولك تعمل إيه في فيجما**، ويقولك لو فيه نسخة قديمة من البلجن لازم تشيلها.

من غير ليستة:

```bash
npm run setup -- codex opencode      # دول بس
npm run setup -- --all               # كل الأدوات اللي على الجهاز
npm run setup -- --dry-run           # يوريك هيعمل إيه من غير ما يغيّر حاجة
npm run setup -- --print             # يطبع الإعدادات بمساراتك عشان تحطها بإيدك في أي أداة MCP
```

- أي ملف إعدادات بيتعدّل بيتاخد منه نسخة احتياطي مرة واحدة: `‎<الملف>.bak-figma-mcp`.
- تقدر تعيد الأمر عادي، مش هيكرّر حاجة، وبيسيب إعداداتك التانية زي ما هي.
- لو ملف الإعدادات فيه comments، مش بيلمسه، وبيطبعلك اللي تحطه بإيدك.
- `npm run connect -- <الأداة>` لسه شغال، وهو نفس `npm run setup -- <الأداة>`.

## لو نقلت الفولدر

- **Codex و OpenCode و Antigravity و Cursor و Gemini CLI و Claude Desktop** بيشغّلوا `~/.figma-mcp/launch.mjs`، ومكانه ثابت. لو ملقاش الفولدر في مكانه القديم، بيدوّر عليه لوحده (Spotlight، وبعدها الأماكن المعتادة زي Desktop و Documents)، وبيسجّل مكانه الجديد ويكمّل.
- **Claude Code** بيقرا البلجن من الفولدر نفسه، فشغّل `npm run setup` (أو `setup.command`) مرة بعد النقل، وهو بيسجّله في مكانه الجديد.
- **فيجما** بتقرا البلجن من `~/.figma-mcp/figma-plugin`، فمش هتحتاج تعمل Import تاني.

## قبل أي أداة (مرة واحدة)

1. **Node 18.17 أو أحدث**: اتأكد بـ `node -v`.
2. **فيجما**: في **Figma Desktop**، لأن نسخة المتصفح مبتشغّلش بلجنز التطوير.
   - **Plugins → Development → Import plugin from manifest…**
   - في نافذة الملفات: ⌘⇧G، الصق `~/.figma-mcp/figma-plugin/manifest.json`، و Enter، وبعدها Open. `npm run setup` بينسخلك المسار.

**وكل مرة تشتغل:** افتح ملف التصميم، وبعدين **Plugins → Development → Figma MCP**، وسيب اللوحة الصغيرة مفتوحة.
النقطة الخضرا معناها إن البلجن متوصل بأداة شغالة. زرار **Pause** بيوقف أي تعديل.

## جدول سريع

| الأداة | ملف MCP | السكيلز | ملاحظة |
|---|---|---|---|
| **Claude Code** | بلجن `figma-mcp@figma-mcp-local` | جوه البلجن | الأكمل: فيه كمان حارس (hook) للفولدر |
| **Codex** | `~/.codex/config.toml` | `~/.agents/skills/` | لازم `tool_timeout_sec` |
| **OpenCode** (V2) | `~/.config/opencode/opencode.json` | `~/.agents/skills/` | `codemode: false` |
| **Antigravity** | `~/.gemini/config/mcp_config.json` | `~/.gemini/config/skills/` | مفيش إعداد مهلة موثّق |
| **Cursor** | `~/.cursor/mcp.json` | `~/.agents/skills/` | |
| **Gemini CLI** | `~/.gemini/settings.json` | `~/.agents/skills/` | |
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` | ZIP بترفعه من الإعدادات | |

- `~/.agents/skills/` هو الفولدر المشترك اللي **Codex و OpenCode و Cursor و Gemini CLI** بيقروا منه كلهم.
- كل الأدوات غير Claude Code بتشغّل: `<node> ~/.figma-mcp/launch.mjs`. الأمر بيكتب المسارات الكاملة بتاعة جهازك (في الأمثلة تحت: `<you>` هو اسم اليوزر).

---

## 1) Claude Code (الأكمل)

```bash
npm run setup -- claude
```

ده بيسجّل الفولدر كـ marketplace محلي وبيسطّب البلجن `figma-mcp` (user scope). ولو الفولدر اتنقل، بيشيل التسجيل القديم ويسجّله من جديد. البلجن فيه:
- **سيرفر MCP** بأدواته الـ 25.
- **سكيل واحد:** `figma-mcp:figma`، وفيه موجّه بيختار الدليل المناسب لكل طلب. كلود بيحمّله لوحده لما تطلب أي حاجة في فيجما، وتقدر تناديه بنفسك: `/figma-mcp:figma`.
- **حارس الفولدر (hook):** أي جلسة شغالة في مشروع تاني مستحيل تعدّل أو تمسح حاجة في فولدر الأداة.

**التشغيل:**
- جلسة جديدة أو `/reload-plugins`، وبعدين اطلب: «figma status».
- `/mcp` بيعرض حالة السيرفر.

**التحديث:** كلود بيقرا البلجن من الفولدر على طول، فبعد أي تحديث `/reload-plugins` أو جلسة جديدة تكفي.

**الإزالة:**
```bash
claude plugin uninstall figma-mcp@figma-mcp-local
claude plugin marketplace remove figma-mcp-local
```

---

## 2) Codex (CLI أو Codex جوه تطبيق ChatGPT)

Codex بيجي CLI لوحده، أو جوه تطبيق ChatGPT، والاتنين بيقروا نفس الإعدادات.

```bash
npm run setup -- codex
```

**الأمر ده بيعمل اتنين:**
1. **بيسجّل السيرفر** في `~/.codex/config.toml`:
   ```toml
   [mcp_servers.figma-mcp]
   command = "/opt/homebrew/bin/node"
   args = ["/Users/<you>/.figma-mcp/launch.mjs"]
   startup_timeout_sec = 30
   tool_timeout_sec = 300
   ```
   - `tool_timeout_sec` مهم، لأن مهلة الأدوات الافتراضية قصيرة (التوثيق بيقول 60 ثانية). وبناء شاشة كبيرة أو كمبوننت بفاريانتس كتير ممكن ياخد أكتر من كده.
   - لو إنت كاتب قيمة بإيدك لأي مفتاح، الأمر بيسيبها زي ما هي.
2. **بيسطّب السكيلز** في `~/.agents/skills/`. ده المكان الجديد، والفولدر القديم `~/.codex/skills` اتلغى (deprecated).

**التشغيل:**
- افتح thread جديد في Codex (أو أعد تشغيله).
- اتأكد من السيرفر: `codex mcp list`.
- **الاستدعاء:**
  - في تطبيق ChatGPT: اكتب `@` واختار `figma-mcp` من قسم Skills (أو من قايمة `/`).
  - في الـ CLI: `$figma-mcp` أو `/skills`.
  - أو اطلب عادي وهو بيتحمّل لوحده من الوصف.
  - بعد أول مرة مش محتاج تناديه تاني في نفس الـ thread: هو بيختار الدليل لكل طلب.
- مثال: «@figma-mcp صمم شاشة تسجيل دخول» (في الـ CLI: «$figma-mcp …»).

**ملاحظات مهمة:**
- **الصور:** Codex بيوصّل صور الأدوات للموديل لو الموديل بيدعم الصور. ولو حصل ومظهرتش، استخدم `screenshot` مع `saveTo` (مثلًا `"saveTo": "figma-shots"`)، وخلي Codex يفتح الصورة بأداة `view_image` بتاعته.
- **الـ sandbox:**
  - Codex نفسه بيكتب جوه المشروع اللي فاتحه بس.
  - سيرفرات MCP مبتشتغلش جوه الـ sandbox، فالحماية هنا من السيرفر بتاعنا نفسه: بيرفض أي تصدير لجوه فولدر figma-mcp.
- **المسارات النسبية:** Codex مبيبعتش للسيرفر غير شوية متغيرات بيئة. السيرفر بيحاول يعرف فولدر المشروع من Codex (MCP roots) أو من الفولدر اللي اشتغل فيه. لو مش متأكد، ادّي مسارات كاملة.

**الإزالة:** `codex mcp remove figma-mcp`، وامسح فولدرات `~/.agents/skills/figma-mcp*`.

---

## 3) OpenCode (V2)

الكلام ده لـ **OpenCode V2**. صيغة الإعدادات بتاعته غير 1.x: السيرفرات تحت `mcp.servers`، والأمر كله مصفوفة واحدة.

```bash
npm run setup -- opencode
```

**الأمر ده بيضيف لملف `~/.config/opencode/opencode.json`:**
```json
{
  "mcp": {
    "servers": {
      "figma-mcp": {
        "type": "local",
        "command": ["/opt/homebrew/bin/node", "/Users/<you>/.figma-mcp/launch.mjs"],
        "codemode": false
      }
    }
  }
}
```
- **`codemode: false`:** OpenCode V2 بيشغّل افتراضيًا «Code Mode»، وفيه الموديل بيوصل لأدوات MCP من خلال أداة واحدة بيكتب فيها كود. احنا بنقفله عشان الـ 25 أداة يبانوا للموديل مباشرة، وده اللي السكيلز مكتوبة عليه.
- **لو عندك سيرفر `figma`** (سيرفر فيجما الرسمي remote)، بيفضل زي ما هو. الاتنين بيشتغلوا جنب بعض.
- **السكيلز:** بتتنسخ في `~/.agents/skills/`، و OpenCode بيقرا منه. لو كان فيه في الإعدادات مسار قديم لفولدر `agent-skills` بيتشال، لأنه بيبوظ لو الفولدر اتنقل.

**التشغيل:**
- أعد تشغيل OpenCode أو اكتب `opencode reload`.
- السكيلز: `/skills` أو `@figma-mcp`.

**ملاحظات:**
- الصور بتوصل للموديل، و OpenCode بيصغّرها لحد 2000px.
- مهلة الأدوات الافتراضية طويلة جدًا، فمش محتاجة تظبيط.

**الإزالة:** امسح `figma-mcp` من `mcp.servers`، وامسح `~/.agents/skills/figma-mcp*`.

---

## 4) Google Antigravity (App و IDE و `agy`)

Antigravity من 2.x بقى تلات حاجات:
- **App**.
- **IDE**.
- **CLI** اسمه **`agy`**: أداة تيرمنال بتسطّبها بـ `curl -fsSL https://antigravity.google/cli/install.sh | bash`.

التلاتة بيقروا إعدادات MCP من `~/.gemini/config/mcp_config.json`.

```bash
npm run setup -- antigravity
```

**الأمر ده بيضيف:**
```json
{
  "mcpServers": {
    "figma-mcp": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/Users/<you>/.figma-mcp/launch.mjs"]
    }
  }
}
```
- لو عندك ملفات بالمسارات القديمة (`~/.gemini/antigravity/mcp_config.json` أو `~/.gemini/antigravity-cli/mcp_config.json`)، الأمر بيضيف السيرفر فيها هي كمان.
- **عشان تعرف نسختك بتقرا أنهي ملف:**
  - IDE: ⋯ أعلى لوحة الـ agent ← **MCP Servers ← Manage MCP Servers ← View raw config**.
  - App: **Settings ← Customizations ← Installed MCP Servers**.
  - CLI: `/mcp`.
- **المسار الكامل لـ node ضروري هنا**، لأن فيه مشكلة معروفة: لما Antigravity يتفتح من الـ Dock، سيرفرات MCP مبتلاقيش `PATH` بتاع الشِل.
- **السكيلز:**
  - Antigravity بيدعمها، والأمر بينسخها في `~/.gemini/config/skills/`.
  - لو موجود عندك `~/.gemini/antigravity/skills/` (IDE قديم) أو `~/.gemini/antigravity-cli/skills/` (agy)، بينسخها فيهم كمان.
  - ولمشروع واحد بس: حطها في `.agents/skills/` جوه المشروع.

**ملاحظات:**
- **المهلة:** مفيش إعداد موثّق لمهلة الأدوات في Antigravity. الأحسن تبني شاشة كبيرة على كذا build (سكشن سكشن)، وده أصلًا اللي السكيلز بتقول عليه.
- **الصور:** النسخ الجديدة بتوصّل الصور الصغيرة للموديل وبتحفظ الكبيرة في ملف. صور `screenshot` الافتراضية صغيرة (1280px). ولو احتجت: `saveTo`.
- **Workflows** في Antigravity اتوقفت (19 أكتوبر 2026)، والبديل هو السكيلز.

**الإزالة:** امسح `figma-mcp` من `mcpServers`، وامسح `~/.gemini/config/skills/figma-mcp*`.

---

## 5) أدوات تانية

| الأداة | الأمر | ملف MCP | السكيلز |
|---|---|---|---|
| **Cursor** | `npm run setup -- cursor` | `~/.cursor/mcp.json` | `~/.agents/skills/` |
| **Gemini CLI** | `npm run setup -- gemini` | `~/.gemini/settings.json` (بمهلة 10 دقايق) | `~/.agents/skills/` |
| **Claude Desktop** | `npm run setup -- claude-desktop` | `~/Library/Application Support/Claude/claude_desktop_config.json` | `figma-mcp.zip` في `~/Downloads/figma-mcp-skills/` |
| **أي أداة MCP تانية** | `npm run setup -- --print` | stdio: `<node> ~/.figma-mcp/launch.mjs` | انسخ `agent-skills/figma-mcp` لفولدر السكيلز بتاعها |

- **Gemini CLI:** للمستخدمين المجانيين اتستبدل بـ Antigravity CLI (يونيو 2026).
- **Claude Desktop:**
  - ارفع `figma-mcp.zip` من **Customize ← Skills**. لازم تكون مفعّل code execution.
  - اقفل التطبيق خالص وافتحه تاني بعد تعديل الإعدادات.

---

## الفروق بين الأدوات

| الحاجة | Claude Code | باقي الأدوات |
|---|---|---|
| الـ 25 أداة | ✓ | ✓ (نفس السيرفر) |
| اسم السكيل | `figma-mcp:figma` | `figma-mcp` (نفس المحتوى) |
| حارس الفولدر (hook) | ✓ | ✗، بس السيرفر بيرفض أي تصدير لجوه فولدر الأداة في كل الأدوات |
| لو الفولدر اتنقل | شغّل `npm run setup` مرة | بتلاقيه لوحدها |
| فولدر المشروع للمسارات النسبية | تلقائي | من الأداة (MCP roots) أو فولدر التشغيل، أو حدده بإيدك بـ `FIGMA_MCP_PROJECT_DIR` في `env` |
| صور السكرين شوت | بتبان للموديل | بتبان في الأغلب، ولو لأ: `screenshot` + `saveTo` |
| تحديث السكيلز وبلجن فيجما | تلقائي | تلقائي |

## أكتر من أداة مع بعض

- ينفع تفتح Claude Code و Codex و OpenCode مع بعض على نفس ملف فيجما، واللوحة هتعرض أوامرهم كلها في نفس السجل.
- **نصيحة:** خلي كل أداة على جزء مختلف، أو واحدة تصمم والتانية تسحب للكود، عشان التعديلات متتداخلش.
- لو البلجن شغال في أكتر من ملف فيجما، أي أداة تقدر تحدد الملف بـ `file: "اسم الملف"`.

## التحديث

بعد أي تحديث للفولدر (`npm run build` أو نسخة جديدة):
- **السيرفر** بيتشغّل من الفولدر على طول، في كل الأدوات.
- **السكيلز** اللي اتنسخت للأدوات التانية بتتحدّث لوحدها أول ما أي أداة تشغّل السيرفر. ده بيحصل بس للفولدرات اللي `npm run setup` حطها، اللي فيها ملف `.figma-mcp`.
- **بلجن فيجما:** الكود بيتحدّث لوحده أول ما أي أداة تكلّمه، والنسخة اللي في `~/.figma-mcp` بتتحدّث مع كل build. الاستثناء الوحيد هو تعديلات واجهة اللوحة نفسها: دي محتاجة تقفل البلجن وتفتحه.
- **الجلسات المفتوحة** بتفضل على السيرفر القديم لحد ما تعيد تشغيلها.

## مشاكل شائعة

| المشكلة | الحل |
|---|---|
| الأداة مش شايفة الأدوات خالص | اتأكد إنك أعدت تشغيلها بعد التركيب. وجرّب `node ~/.figma-mcp/launch.mjs` بإيدك: لازم يطبع `ready` ويفضل شغال |
| `node: command not found` أو `executable file not found` | أعد `npm run setup`: بيكتب المسار الكامل لـ node |
| `can't find the figma-mcp folder` | اللانشر ملقاش الفولدر في أي حتة. افتح الفولدر في التيرمنال وشغّل `npm run setup` |
| Claude Code مش شايف البلجن بعد ما نقلت الفولدر | شغّل `npm run setup` (أو `setup.command`) مرة |
| «Not connected» | شغّل بلجن Figma MCP في فيجما ديسكتوب وسيب لوحته مفتوحة. لو شباك فيجما مستخبي ورا شبابيك تانية، فيجما بتبطّأ البلجن وممكن ياخد لحد دقيقة يتوصل (الأدوات بتستنى 60 ثانية). جيب فيجما قدام يسرّع |
| انتهت مهلة الأداة | زوّد المهلة (Codex: `tool_timeout_sec`، Gemini: `timeout`)، أو قسّم البناء لسكاشن |
| «Unable to establish connection to Figma» | فيجما ديسكتوب نفسه فقد الاتصال بسيرفرات فيجما (نت أو عطل عندهم). استنى لحد ما يرجع وأعد المحاولة |
| الأداة استخدمت سيرفر فيجما الرسمي بدل بتاعنا | قولها صريح: «use the figma-mcp tools»، أو اقفل السيرفر الرسمي لو مش محتاجه |
| التصدير اترفض | ده الحارس: اكتب جوه مشروعك، مش جوه فولدر figma-mcp |
| عايز تعرف الحالة | `npm run doctor`: بيعرض البناء، والأدوات المتسطّب عليها، وفيجما مستوردة البلجن منين، والبورتات، والملفات المتوصلة، وآخر اللوج |

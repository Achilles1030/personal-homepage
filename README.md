# Personal Homepage

宋筱潇（Achilles）的个人主页，包含安全的访客反馈表单与管理员后台。

## 页面

- `index.html`：个人主页与访客反馈表单
- `admin.html`：管理员反馈后台
- `supabase/functions/submit-feedback/`：公开反馈提交 Edge Function
- `supabase/schema.sql`：数据库结构、权限与 RLS 策略

## 安全模型

- 访客不能直接读取或写入 `feedback` 表。
- 匿名反馈仅能通过 `submit-feedback` Edge Function 提交。
- Edge Function 校验来源、字段长度、邮箱格式、蜜罐字段，并按 IP 限流。
- 后台使用 Supabase Auth 登录；RLS 仅允许指定管理员邮箱读取、更新和删除反馈。
- 浏览器只包含 Supabase publishable key，不包含 secret/service-role key。

## 首次使用后台

先在 Supabase Dashboard 的 Authentication → Users 中创建管理员账号，再打开 `admin.html` 登录。管理员邮箱仅保存在 Supabase RLS 策略中，不应提交到公开仓库。创建账号后建议关闭公开注册。

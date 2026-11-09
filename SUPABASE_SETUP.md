# Підключення Supabase Auth до «Року психології»

Код готовий локально. До справжнього Supabase-проєкту він ще не підключений: URL, ключі, email-провайдер та Google налаштовує власник у своїх панелях. Публікацію й push із цього сеансу не виконано.

## 1. Створи Supabase-проєкт і скопіюй публічні налаштування

1. У [Supabase Dashboard](https://supabase.com/dashboard) створи New project або відкрий потрібний проєкт.
2. У **Connect** знайди Project URL і **publishable key**. Ключі також є в **Settings → API Keys**.
3. Для цього проєкту назви змінних залишаються такими:

```dotenv
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=sb_publishable_YOUR_PUBLIC_KEY
```

`SUPABASE_ANON_KEY` приймає сучасний publishable key або старий JWT-ключ з роллю `anon`. Назва змінної збережена відповідно до вимоги. Supabase рекомендує сучасні publishable keys. **Secret / service_role сюди не підходять**: це браузерні налаштування, вони видимі у завантаженому JS. Збірка відхиляє секретні та service_role ключі й передає тільки ці дві змінні. [Офіційно про ключі](https://supabase.com/docs/guides/getting-started/api-keys).

## 2. Додай змінні у Vercel

У своєму Vercel-проєкті відкрий **Settings → Environment Variables** та додай обидві змінні без лапок. Вибери **Production**; для тестових deployment також **Preview**.

У репозиторії додано `vercel.json`:

| Налаштування | Значення |
|---|---|
| Framework Preset | Other |
| Node.js | 22 або новіший підтримуваний Vercel |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

**Попередні налаштування «без build» та Output Directory `.` більше не використовуються.** Браузер сам не читає Vercel Environment Variables. Скрипт збірки створює `dist/runtime-config.js` з публічними значеннями й пакує офіційний `@supabase/supabase-js` у локальний `dist/auth.js`.

Опублікуй оновлений код звичним для свого проєкту способом. Якщо Vercel підключений до Git, спочатку потрібно передати цю версію у віддалений репозиторій. Після додавання/зміни Environment Variables зроби новий deployment або **Redeploy** актуальної версії. Зміни env не застосовуються до вже готового deployment. [Документація Vercel](https://vercel.com/docs/environment-variables/managing-environment-variables).

Якщо обидві змінні відсутні, збірка дозволяє локальний режим і показує «Вхід ще не підключено». Якщо задана лише одна змінна, неправильний URL або непублічний ключ — збірка завершується помилкою.

## 3. Налаштуй адреси повернення

У **Supabase → Authentication → URL Configuration**:

- **Site URL**: реальний домен сайту, наприклад `https://YOUR-SITE.vercel.app`.
- **Redirect URLs**: додай точні адреси `https://YOUR-SITE.vercel.app` і `https://YOUR-SITE.vercel.app/`.
- Для локальної розробки додай `http://localhost:8080` і `http://localhost:8080/`.
- Якщо користуєшся іншим production-доменом або конкретним preview-доменом, додай його також.

Код передає **поточний `window.location.origin`** як `redirectTo` для Google та `emailRedirectTo` для реєстрації. Цей origin має бути дозволений у Supabase. OAuth використовує PKCE, тому параметр `?code=...` не займає hash-маршрути навчальних розділів. Підтверджувальне посилання відкривай у тому самому браузері, де почав реєстрацію; в іншому браузері після підтвердження може знадобитися звичайний вхід за паролем. [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

## 4. Увімкни Email / Password

У **Authentication → Sign In / Providers → Email** перевір, що вхід за email увімкнений. Якщо **Confirm email** увімкнено, новий користувач спочатку отримує лист, а застосунок показує повідомлення про підтвердження; сам факт відповіді `signUp` не означає активного входу.

Для реальних користувачів налаштуй **Custom SMTP** для листів підтвердження. Вбудована поштова служба Supabase має тестові обмеження; перевір також папку спаму. [Email/password](https://supabase.com/docs/guides/auth/passwords), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## 5. Підключи Google

1. У [Google Cloud Console](https://console.cloud.google.com/) створи або вибери проєкт і налаштуй OAuth consent screen. Для режиму Testing додай свої адреси до Test users.
2. Створи **OAuth Client ID → Web application**.
3. У **Authorized JavaScript origins** додай origin сайту, наприклад `https://YOUR-SITE.vercel.app`. Для локального запуску — `http://localhost:8080`.
4. У **Authorized redirect URIs** додай **Supabase callback**, скопійований зі сторінки Google provider у Supabase. Зазвичай це:

```text
https://YOUR-PROJECT.supabase.co/auth/v1/callback
```

5. У **Supabase → Authentication → Sign In / Providers → Google** увімкни провайдер і встав Google **Client ID** та **Client Secret**. Google Client Secret зберігається тільки в налаштуваннях провайдера Supabase.
6. Збережи й натисни на сайті **«Вхід через Google»**.

Google повертає користувача спочатку до Supabase callback, а Supabase — на origin твого сайту. Це дві різні адреси. [Офіційна інструкція Google Auth](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).

## 6. Перевір підключення

1. На сайті натисни **Увійти** в меню або верхній панелі.
2. Зареєструй тестову адресу, підтвердь email, увійди й перевір відображення профілю.
3. Перезавантаж сторінку: сесія має відновитися, а `getUser()` — перевірити користувача.
4. Перевір вихід і окремо Google.
5. Дочекайся готовності PWA до офлайн-роботи, вимкни мережу й перезавантаж сайт. Локальне навчання має працювати, профіль — показувати **«Збережений вхід · офлайн»**. Це не підтвердження чинності токена сервером.
6. Увімкни мережу: клієнт повторно перевірить користувача. Якщо холодний запуск був офлайн, SDK створюється лише зараз; до цього кнопка виходу може бути недоступна.

Сесія Supabase зберігається SDK окремо від `psykholohiia-rik-v1`. Вихід не очищає навчальні дані. **Це інтеграція Auth, а не хмарна синхронізація нотаток/прогресу**: локальний навчальний профіль наразі спільний для акаунтів на одному браузері. Для синхронізації між пристроями потрібен окремий шар даних із RLS; у цій зміні він не створювався.

## Локальний запуск

Потрібні Node.js 22+ та npm:

```sh
npm ci
cp .env.example .env.local
```

Заміни приклади в `.env.local` своїми двома публічними значеннями, потім:

```sh
npm run build
python3 -m http.server 8080 --directory dist
```

Відкрий `http://localhost:8080`. `.env.local`, `dist/` та `node_modules/` не входять у Git. Прямий запуск вихідного `index.html` не створює конфігурацію або SDK-файл.

## Файли й перевірки реалізації

- `src/auth-controller.mjs` — асинхронні дії, перевірка `getUser()`, події сесії, локальні повідомлення, захист від застарілих відповідей.
- `src/auth-client.mjs` — параметри єдиного SDK-клієнта, відкладений старт офлайн.
- `src/auth.mjs` — модальне вікно, безпечне відображення профілю через `textContent`, глобальні `window.rikSupabase` та `window.RikAuth`.
- `scripts/build.mjs`, `scripts/public-config.mjs` — збірка SDK, whitelist env, fingerprint SW.
- `index.html` — доступний dialog, кнопки, інтеграція з меню, захист чернеток перед OAuth і PWA update.
- `service-worker.js` — кешує також `auth.js` і `runtime-config.js`; відповіді Supabase API не кешуються.

`npm test`: **178 попередніх + 29 нових = 207 успішних перевірок**. Перевірені всі Auth-дії, помилки, підтвердження пошти, події інших вкладок, відновлення/офлайн, справжній SDK з ізольованою API-відповіддю, складання production-файлів і зміна кешу при зміні env. Немає запитів до особистого Supabase-проєкту.

`npm run build` проходить. Браузерний інструмент недоступний (`The browser access host is unavailable`), тому реальний OAuth/лист/Supabase-проєкт і мобільну верстку треба перевірити після підключення. Наявні локальні тести не є підтвердженням успішного входу в ще не налаштований акаунт.

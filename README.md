# Voqenti - Pontaj Digital

Aplicație React + Supabase + Capacitor pentru monitorizarea orelor de lucru cu suport multi-user, timezone (Germany/Berlin), și sincronizare realtime.

## 🚀 Features

- ✅ **Autentificare Supabase**: Sign up, sign in, sign out
- ✅ **Multi-user**: Fiecare utilizator vede doar propriile înregistrări de pontaj
- ✅ **Timezone Berlin**: Afișarea corectă a orei din Germania (Europe/Berlin)
- ✅ **Realtime Sync**: Actualizare instantanee a istoricului când se schimbă datele
- ✅ **Persistent Timer**: Sesiunile active se mențin și după reîncărcare
- ✅ **Android APK**: Aplicație nativă via Capacitor
- ✅ **Modern UI**: Tailwind CSS cu design glas-morphism

## 📋 Prerequisite Setup

1. **Supabase Project**: Crează-ți un proiect pe [supabase.com](https://supabase.com)
2. **Environment Variables**: Copiază `.env.example` → `.env` și adaugă:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

3. **Database Setup**: Urmărește [SUPABASE_AUTH_SETUP.md](./SUPABASE_AUTH_SETUP.md)

## 🛠️ Development

### Web (Local)
```bash
npm install
npm run dev
```
Accesează `http://localhost:5173`

### Android (Phone)
```bash
npm install
npm run build
npx cap sync android
cd android && .\gradlew.bat assembleDebug
```
APK va fi în `android/app/build/outputs/apk/debug/app-debug.apk`

## 📁 Project Structure

```
voqenti/
├── src/
│   ├── App.jsx           # Main app + auth UI + pontaj logic
│   ├── supabaseClient.js # Supabase client config
│   ├── main.jsx
│   ├── App.css
│   └── index.css         # Tailwind
├── android/              # Capacitor Android project
├── dist/                 # Build output (Vite)
├── vite.config.js
├── tailwind.config.js
├── package.json
└── SUPABASE_AUTH_SETUP.md # Auth setup guide
```

## 🔐 Authentication Flow

1. **Sign Up**: Email + password → Supabase creates user + sends confirmation email
2. **Sign In**: Email + password → loads user's pontaj records
3. **Sign Out**: Clears session
4. **RLS Policies**: Row Level Security ensures each user sees only own data

## 💾 Database Schema

Table: `pontaj`
```sql
id              bigint (primary key)
user_id         uuid (references auth.users)
name_nutzer     text
Uhrzeit_Start   timestamp with timezone
Uhrzeit_Ende    timestamp with timezone (nullable)
status          text ('activ' or 'finalizat')
created_at      timestamp with timezone
```

## 🚨 Troubleshooting

### "Auth Error" or buttons don't work
- Verifică `.env` are valorile corecte
- Verifică Email Provider este activat în Supabase
- Vezi [SUPABASE_AUTH_SETUP.md](./SUPABASE_AUTH_SETUP.md)

### "No records" in history
- Sigură-te că ai adăugat coloana `user_id` în tabela `pontaj`
- Verifică RLS policies sunt activate (SQL commands în setup guide)

### Email confirmation nu merge
- Verifică folder Spam/Junk
- Supabase Dashboard → Project Settings → Email → Logs

## 📱 APK Distribution

După build, transferă `app-debug.apk` la telefon:

**Via HTTP Server:**
```bash
cd android/app/build/outputs/apk/debug
python -m http.server 8000
```
Deschide pe telefon: `http://YOUR_PC_IP:8000/` și descarcă

**Via USB:**
```bash
adb install app-debug.apk
```

## 🎨 Tech Stack

- **Frontend**: React 18 + Vite
- **Styling**: Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth)
- **Date/Time**: Luxon (timezone handling)
- **Native**: Capacitor + Android
- **Realtime**: Supabase Realtime channels

## 📝 License

MIT

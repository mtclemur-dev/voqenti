# Supabase Auth Setup Guide

Ghidul complet pentru a activa autentificarea și baza de date multi-user.

## Pasul 1: Configurare Supabase Dashboard

### 1.1 Enable Auth (Autentificare)
1. Mergi la [Supabase Dashboard](https://app.supabase.com)
2. Selectează proiectul tău
3. Mergi la **Authentication** > **Providers**
4. Verifica că **Email** este activat (ar trebui să fie implicit)

### 1.2 Configure Email Templates
1. Mergi la **Authentication** > **Email Templates**
2. Verifica că template-uri sunt setate pentru:
   - Confirm signup
   - Magic Link
   - Change Email
   - Reset Password

### 1.3 Configure Redirect URLs
1. Mergi la **Authentication** > **URL Configuration**
2. Sub **Redirect URLs**, adaugă:
   - `http://localhost:5173`
   - `http://localhost:5173/auth/callback`
   - `capacitor://localhost` (pentru app Android)

## Pasul 2: Adăugare coloană `user_id` în tabela `pontaj`

### 2.1 SQL Editor
1. Mergi la **SQL Editor** > **New Query**
2. Rulează aceste comenzi SQL:

```sql
-- Adaugă coloana user_id dacă nu există
ALTER TABLE public.pontaj 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Creează index pentru performanță
CREATE INDEX idx_pontaj_user_id ON public.pontaj(user_id);

-- Dacă vrei să populezi recordurile existente cu un user ID (opțional)
-- UPDATE public.pontaj SET user_id = 'YOUR_USER_UUID_HERE' WHERE user_id IS NULL;
```

## Pasul 3: Activare Row Level Security (RLS)

### 3.1 Enable RLS
1. Mergi la **SQL Editor** > **New Query**
2. Rulează:

```sql
-- Activare RLS
ALTER TABLE public.pontaj ENABLE ROW LEVEL SECURITY;

-- Politică SELECT: fiecare utilizator vede numai propriile înregistrări
CREATE POLICY "Select own records" ON public.pontaj 
FOR SELECT 
USING (auth.uid() = user_id);

-- Politică INSERT: fiecare utilizator poate insera doar cu propriul user_id
CREATE POLICY "Insert own records" ON public.pontaj 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Politică UPDATE: fiecare utilizator poate modifica numai propriile înregistrări
CREATE POLICY "Update own records" ON public.pontaj 
FOR UPDATE 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Politică DELETE: fiecare utilizator poate șterge numai propriile înregistrări
CREATE POLICY "Delete own records" ON public.pontaj 
FOR DELETE 
USING (auth.uid() = user_id);
```

## Pasul 4: Test Local

1. Asigură-te că .env are valorile corecte:
```
VITE_SUPABASE_URL=https://ybgjxdlegdgdgpznbiiu.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_2_bOkxUu3UfznQbVSDFjzw_ov4A_qYZ
```

2. Pornește dev server:
```bash
npm run dev
```

3. Testează în browser:
   - Mergi la `http://localhost:5173`
   - Apasă "Înregistrează-te"
   - Introdu email și parolă
   - Ar trebui să vezi un mesaj: "Verifică emailul pentru confirmare"

4. În Supabase Dashboard, mergi la **Authentication** > **Users** și verifica că utilizatorul a fost creat

## Pasul 5: Email Confirmation (Confirmarea prin Email)

### Opțiunea A: Supabase Email (Free - recomandat pentru test)
- Supabase trimite emailuri de confirmare automat
- Verifică în Gmail Spam dacă nu apare în Inbox

### Opțiunea B: Custom SMTP (pentru producție)
1. Mergi la **Project Settings** > **Email**
2. Configurează SMTP (Gmail, SendGrid, etc.)

## Pasul 6: Android APK Update (Dacă vrei pe telefon)

După ce autentificarea funcționează local:

```bash
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

APK va fi în: `android/app/build/outputs/apk/debug/app-debug.apk`

## Verificare finală

Ar trebui să poți:
1. ✅ Te înregistra cu email/parolă
2. ✅ Primii emailul de confirmare
3. ✅ Te autentifici cu acele credențiale
4. ✅ Verzi doar propriile înregistrări de pontaj
5. ✅ Poți adăuga noi înregistrări cu butonul "Începe munca"
6. ✅ Fiecare utilizator vede doar propriile date

## Troubleshooting

### Eroare: "Auth Error"
- Verifică că `.env` are valorile corecte din Supabase
- Verifica că Email Provider este activat în Supabase

### Eroare: "No RLS policies found"
- Asigură-te că ai rulat comenzile SQL din Pasul 3

### Eroare: "user_id is required"
- Adaugă coloana din Pasul 2 (SQL ALTER TABLE)

### Email nu vine
- Verifică folder Spam/Junk
- Supabase: verifica Email Templates sunt completate
- Verifica Email Logs în Supabase Dashboard: **Project Settings** > **Logs**


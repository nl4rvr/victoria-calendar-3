# Firebase — что сделать один раз

## 1. Authentication
Console → Authentication → Sign-in method → **Email/Password** → Enable → Save

## 2. Firestore Database
Console → Firestore Database → Create database → выбери регион → Start in **production mode** (правила поставим сами)

## 3. Правила Firestore
Console → Firestore → вкладка **Rules** → вставь **целиком** и Publish:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    function isAdmin() {
      return isSignedIn() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    function isOwner(userId) {
      return isSignedIn() && request.auth.uid == userId;
    }

    // Профили пользователей
    match /users/{userId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn() && request.auth.uid == userId;
      allow update: if isSignedIn() && (request.auth.uid == userId || isAdmin());
      allow delete: if false;
    }

    // Настройки цикла (ключ = uid девушки)
    match /cycles/{userId} {
      allow read: if isSignedIn();
      allow write: if isOwner(userId) || isAdmin();
    }

    // Записи дневника
    match /logs/{logId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn();
      allow update, delete: if isSignedIn() && (
        resource.data.userId == request.auth.uid || isAdmin()
      );
    }

    // Мигрени
    match /migraines/{migId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn();
      allow update, delete: if isSignedIn() && (
        resource.data.userId == request.auth.uid || isAdmin()
      );
    }
  }
}
```

## 4. Пользователи
Ничего создавать вручную не нужно.

При первом входе аккаунты создаются сами:
- **vika1@vika.com** → роль girl (Вика)
- **kostya@kostya.com** → роль admin (Кисунчик)

Пароль придумываете сами (минимум 6 символов).

## 5. Порядок первого запуска
1. Сначала войди с **vika1@vika.com** (создастся профиль девушки)
2. Потом войди с **kostya@kostya.com** — админ увидит её данные

## 6. Хостинг (чтобы PWA работало)
Нужен HTTPS. Самый простой способ:

```bash
# если ещё не установлен firebase-tools
npm i -g firebase-tools
firebase login
cd cycle-tracker
firebase init hosting   # выбери проект victoria-calendar-947d4, public = .
firebase deploy
```

Или залей папку на Vercel / Netlify / любой статический хостинг.

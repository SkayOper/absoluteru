const express = require('express');
const session = require('express-session');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================================
// КОНФИГУРАЦИЯ
// ===============================================

const CONFIG = {
    STEAM_API_KEY: '1E17B9BA76ED174B284A4BE5A420047C',
    SERVER_API_KEY: '1YssSHOPVzwGea9qks8loKuG',
    DOMAIN: process.env.DOMAIN || `https://absoluteru.netlify.app`,
    
    // Роли пользователей
    ROLES: {
        PLAYER: { name: 'Игрок', color: '#00ff88', level: 0 },
        VIP: { name: 'VIP', color: '#ffd700', level: 1 },
        MODERATOR: { name: 'Модератор', color: '#4488ff', level: 2 },
        ADMIN: { name: 'Администратор', color: '#ff4444', level: 3 },
        OWNER: { name: 'Владелец', color: '#ff00ff', level: 4 }
    },
    
    // Steam ID владельца (ЗАМЕНИТЕ НА СВОЙ!)
    OWNER_STEAM_ID: '76561199048623002' // УКАЖИТЕ ВАШ STEAM ID
};

// ===============================================
// БАЗА ДАННЫХ (JSON файлы)
// ===============================================

const DB_PATH = path.join(__dirname, 'data');
const USERS_DB = path.join(DB_PATH, 'users.json');
const FEEDBACK_DB = path.join(DB_PATH, 'feedback.json');
const STATS_DB = path.join(DB_PATH, 'stats.json');

// Создаем папку для БД если не существует
if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(DB_PATH);
}

// Инициализируем файлы БД
function initDB() {
    if (!fs.existsSync(USERS_DB)) {
        fs.writeFileSync(USERS_DB, JSON.stringify({}));
    }
    if (!fs.existsSync(FEEDBACK_DB)) {
        fs.writeFileSync(FEEDBACK_DB, JSON.stringify([]));
    }
    if (!fs.existsSync(STATS_DB)) {
        fs.writeFileSync(STATS_DB, JSON.stringify({}));
    }
}

initDB();

// Функции работы с БД
function readDB(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return file === FEEDBACK_DB ? [] : {};
    }
}

function writeDB(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ===============================================
// MIDDLEWARE
// ===============================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Настройка сессии
app.use(session({
    secret: 'absoluty-secret-key-2025',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 дней
    }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// ===============================================
// STEAM AUTHENTICATION
// ===============================================

passport.use(new SteamStrategy({
    returnURL: `${CONFIG.DOMAIN}/auth/steam/return`,
    realm: CONFIG.DOMAIN,
    apiKey: CONFIG.STEAM_API_KEY
}, async (identifier, profile, done) => {
    try {
        const steamID = profile.id;
        const users = readDB(USERS_DB);
        
        // Если пользователя нет - создаем
        if (!users[steamID]) {
            users[steamID] = {
                steamID: steamID,
                displayName: profile.displayName,
                avatar: profile.photos[2].value,
                role: steamID === CONFIG.OWNER_STEAM_ID ? 'OWNER' : 'PLAYER',
                registeredAt: new Date().toISOString(),
                lastLogin: new Date().toISOString()
            };
        } else {
            // Обновляем данные при входе
            users[steamID].displayName = profile.displayName;
            users[steamID].avatar = profile.photos[2].value;
            users[steamID].lastLogin = new Date().toISOString();
        }
        
        writeDB(USERS_DB, users);
        
        profile.role = users[steamID].role;
        return done(null, profile);
    } catch (error) {
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

// ===============================================
// МАРШРУТЫ АВТОРИЗАЦИИ
// ===============================================

app.get('/auth/steam', passport.authenticate('steam'));

app.get('/auth/steam/return', 
    passport.authenticate('steam', { failureRedirect: '/' }),
    (req, res) => {
        res.redirect('/#profile');
    }
);

app.get('/auth/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/');
    });
});

// ===============================================
// API ENDPOINTS
// ===============================================

// Получить данные текущего пользователя
app.get('/api/user', (req, res) => {
    if (!req.user) {
        return res.json({ authenticated: false });
    }
    
    const users = readDB(USERS_DB);
    const userData = users[req.user.id];
    const roleInfo = CONFIG.ROLES[userData.role];
    
    res.json({
        authenticated: true,
        steamID: req.user.id,
        displayName: req.user.displayName,
        avatar: req.user.photos[2].value,
        profileUrl: req.user._json.profileurl,
        role: userData.role,
        roleInfo: roleInfo,
        registeredAt: userData.registeredAt,
        lastLogin: userData.lastLogin
    });
});

// Получить статистику игрока
app.get('/api/stats/:steamID', async (req, res) => {
    try {
        const steamID = req.params.steamID;
        const stats = readDB(STATS_DB);
        
        // Если статистики нет - возвращаем дефолтные значения
        if (!stats[steamID]) {
            return res.json({
                steamID: steamID,
                playTime: 0,
                kills: 0,
                deaths: 0,
                escapes: 0,
                gamesPlayed: 0,
                lastPlayed: null
            });
        }
        
        res.json(stats[steamID]);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});

// Обновить статистику (вызывается сервером SCP:SL)
app.post('/api/stats/update', (req, res) => {
    try {
        const { apiKey, steamID, data } = req.body;
        
        // Проверяем API ключ
        if (apiKey !== CONFIG.SERVER_API_KEY) {
            return res.status(403).json({ error: 'Неверный API ключ' });
        }
        
        const stats = readDB(STATS_DB);
        
        // Обновляем или создаем статистику
        stats[steamID] = {
            ...stats[steamID],
            ...data,
            lastUpdated: new Date().toISOString()
        };
        
        writeDB(STATS_DB, stats);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка обновления статистики' });
    }
});

// Получить онлайн сервера
app.get('/api/server/status', async (req, res) => {
    try {
        // Здесь нужно реализовать запрос к API вашего SCP:SL сервера
        // Пока возвращаем моковые данные
        res.json({
            online: true,
            players: 12,
            maxPlayers: 30,
            map: 'Facility',
            version: '13.5.0'
        });
    } catch (error) {
        res.json({
            online: false,
            players: 0,
            maxPlayers: 30,
            map: 'Unknown',
            version: 'Unknown'
        });
    }
});

// Отправить обратную связь
app.post('/api/feedback', (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Необходима авторизация' });
        }
        
        const { type, message } = req.body;
        
        if (!type || !message) {
            return res.status(400).json({ error: 'Тип и сообщение обязательны' });
        }
        
        const feedback = readDB(FEEDBACK_DB);
        
        const newFeedback = {
            id: Date.now().toString(),
            steamID: req.user.id,
            displayName: req.user.displayName,
            avatar: req.user.photos[2].value,
            type: type,
            message: message,
            status: 'new',
            createdAt: new Date().toISOString(),
            replies: []
        };
        
        feedback.push(newFeedback);
        writeDB(FEEDBACK_DB, feedback);
        
        res.json({ success: true, feedback: newFeedback });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка отправки обратной связи' });
    }
});

// Получить всю обратную связь (только для админов/модеров)
app.get('/api/feedback', (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Необходима авторизация' });
        }
        
        const users = readDB(USERS_DB);
        const userRole = users[req.user.id].role;
        const roleLevel = CONFIG.ROLES[userRole].level;
        
        // Только модераторы и выше
        if (roleLevel < 2) {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }
        
        const feedback = readDB(FEEDBACK_DB);
        res.json(feedback);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка получения обратной связи' });
    }
});

// Получить свою обратную связь
app.get('/api/feedback/my', (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Необходима авторизация' });
        }
        
        const feedback = readDB(FEEDBACK_DB);
        const myFeedback = feedback.filter(f => f.steamID === req.user.id);
        
        res.json(myFeedback);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка получения обратной связи' });
    }
});

// Обновить статус обратной связи (только админы/модеры)
app.patch('/api/feedback/:id', (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Необходима авторизация' });
        }
        
        const users = readDB(USERS_DB);
        const userRole = users[req.user.id].role;
        const roleLevel = CONFIG.ROLES[userRole].level;
        
        if (roleLevel < 2) {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }
        
        const { status, reply } = req.body;
        const feedbackId = req.params.id;
        
        const feedback = readDB(FEEDBACK_DB);
        const item = feedback.find(f => f.id === feedbackId);
        
        if (!item) {
            return res.status(404).json({ error: 'Обратная связь не найдена' });
        }
        
        if (status) item.status = status;
        
        if (reply) {
            item.replies.push({
                author: req.user.displayName,
                steamID: req.user.id,
                message: reply,
                createdAt: new Date().toISOString()
            });
        }
        
        writeDB(FEEDBACK_DB, feedback);
        res.json({ success: true, feedback: item });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка обновления обратной связи' });
    }
});

// Изменить роль пользователя (только владелец)
app.post('/api/admin/change-role', (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Необходима авторизация' });
        }
        
        const users = readDB(USERS_DB);
        const currentUserRole = users[req.user.id].role;
        
        // Только владелец может менять роли
        if (currentUserRole !== 'OWNER') {
            return res.status(403).json({ error: 'Только владелец может менять роли' });
        }
        
        const { steamID, newRole } = req.body;
        
        if (!steamID || !newRole) {
            return res.status(400).json({ error: 'SteamID и новая роль обязательны' });
        }
        
        if (!CONFIG.ROLES[newRole]) {
            return res.status(400).json({ error: 'Неверная роль' });
        }
        
        if (!users[steamID]) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        users[steamID].role = newRole;
        writeDB(USERS_DB, users);
        
        res.json({ success: true, user: users[steamID] });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка изменения роли' });
    }
});

// Получить список всех пользователей (только админы+)
app.get('/api/admin/users', (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Необходима авторизация' });
        }
        
        const users = readDB(USERS_DB);
        const currentUserRole = users[req.user.id].role;
        const roleLevel = CONFIG.ROLES[currentUserRole].level;
        
        if (roleLevel < 3) {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }
        
        // Преобразуем объект в массив
        const usersList = Object.values(users).map(user => ({
            ...user,
            roleInfo: CONFIG.ROLES[user.role]
        }));
        
        res.json(usersList);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка получения пользователей' });
    }
});

// ===============================================
// СТАТИЧЕСКИЕ ФАЙЛЫ
// ===============================================

app.use(express.static(path.join(__dirname, 'public')));

// Все маршруты -> index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===============================================
// ЗАПУСК СЕРВЕРА
// ===============================================

app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('🎮 АБСОЛЮТИТЫ SCP:SL - Сервер запущен!');
    console.log('='.repeat(50));
    console.log(`🌐 URL: ${CONFIG.DOMAIN}`);
    console.log(`🔑 Steam API: ${CONFIG.STEAM_API_KEY.substring(0, 8)}...`);
    console.log(`💾 База данных: ${DB_PATH}`);
    console.log('='.repeat(50));
});

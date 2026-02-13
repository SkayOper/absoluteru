const express = require('express');
const session = require('express-session');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ===============================================
// ПОДКЛЮЧЕНИЕ СТАТИЧЕСКИХ ФАЙЛОВ - ИСПРАВЛЕНО
// ===============================================

// Указываем Express раздавать файлы из папки public
app.use(express.static(path.join(__dirname, 'public')));

// ===============================================
// КОНФИГУРАЦИЯ
// ===============================================

const CONFIG = {
    steam: {
        apiKey: '1E17B9BA76ED174B2844ABE5A420047C',
        returnURL: `https://absoluteru.onrender.com/auth/steam/return`, // ВАЖНО: используем ваш домен
        realm: `https://absoluteru.onrender.com/`
    },
    server: {
        ip: '193.164.17.26',
        port: 7777,
        name: 'Абсолютиты RU NoRules'
    }
};

// ===============================================
// НАСТРОЙКА СЕССИИ
// ===============================================

app.use(session({
    secret: 'absoluty-secret-key-2025',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        secure: true, // ВАЖНО для HTTPS на Render
        sameSite: 'none'
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// ===============================================
// STEAM STRATEGY
// ===============================================

passport.use(new SteamStrategy({
    returnURL: CONFIG.steam.returnURL,
    realm: CONFIG.steam.realm,
    apiKey: CONFIG.steam.apiKey
}, (identifier, profile, done) => {
    profile.identifier = identifier;
    
    // Определение роли
    const admins = [
        // Добавьте сюда SteamID администраторов
    ];
    
    let role = 'PLAYER';
    let roleInfo = {
        name: 'Игрок',
        color: '#b0b0c0',
        level: 0
    };
    
    if (admins.includes(profile.id)) {
        role = 'ADMIN';
        roleInfo = {
            name: '🛡️ Админ',
            color: '#ffaa00',
            level: 3
        };
    }
    
    profile.role = role;
    profile.roleInfo = roleInfo;
    
    return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

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

app.get('/api/user', (req, res) => {
    if (req.user) {
        res.json({
            authenticated: true,
            id: req.user.id,
            displayName: req.user.displayName,
            avatar: req.user._json.avatarfull,
            steamID: req.user._json.steamid,
            role: req.user.role,
            roleInfo: req.user.roleInfo,
            profile: req.user._json
        });
    } else {
        res.json({ authenticated: false });
    }
});

// ===============================================
// СТАТУС СЕРВЕРА
// ===============================================

app.get('/api/server/status', async (req, res) => {
    try {
        const Gamedig = require('gamedig');
        const state = await Gamedig.query({
            type: 'scpsl',
            host: CONFIG.server.ip,
            port: CONFIG.server.port,
            timeout: 3000
        });
        
        res.json({
            success: true,
            online: true,
            name: state.name || CONFIG.server.name,
            map: state.map || 'Facility',
            players: state.players?.length || 0,
            maxPlayers: state.maxplayers || 25,
            playersList: (state.players || []).map(p => ({
                name: p.name || 'Игрок',
                score: p.raw?.score || 0
            }))
        });
    } catch (error) {
        res.json({
            success: true,
            online: false,
            name: CONFIG.server.name,
            map: 'Недоступно',
            players: 0,
            maxPlayers: 25,
            playersList: []
        });
    }
});

// ===============================================
// ВАЖНО: Этот маршрут ДОЛЖЕН БЫТЬ ПОСЛЕДНИМ
// ===============================================

app.get('*', (req, res) => {
    res.sendFile(path.join('index.html'));
});

// ===============================================
// ЗАПУСК
// ===============================================

app.listen(PORT, '0.0.0.0', () => { // ВАЖНО: слушаем все интерфейсы
    console.log(`
╔════════════════════════════════╗
║  Абсолютиты SCP:SL            ║
║  Сервер запущен               ║
║  Порт: ${PORT}                    ║
║  Домен: https://absoluteru.onrender.com ║
╚════════════════════════════════╝
    `);
});

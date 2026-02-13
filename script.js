// ===============================================
// КОНФИГУРАЦИЯ
// ===============================================

const CONFIG = {
    LINKS: {
        discord: 'https://discord.gg/hu9Q2YvBqb',
        boosty: 'https://boosty.to/absolute.ru',
        mrpRules: 'https://в разработке'
    },
    UPDATE_INTERVAL: 30000 // 30 секунд
};

// ===============================================
// ГЛОБАЛЬНОЕ СОСТОЯНИЕ
// ===============================================

let currentUser = null;
let serverStatus = null;

// ===============================================
// ИНИЦИАЛИЗАЦИЯ
// ===============================================

document.addEventListener('DOMContentLoaded', async () => {
    initializeNavigation();
    initializeLinks();
    await loadUserData();
    await loadServerStatus();
    
    // Автообновление статуса сервера
    setInterval(loadServerStatus, CONFIG.UPDATE_INTERVAL);
    
    // Обработчик формы обратной связи
    const feedbackForm = document.getElementById('feedbackForm');
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', handleFeedbackSubmit);
    }
});

// ===============================================
// НАВИГАЦИЯ
// ===============================================

function initializeNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const pages = document.querySelectorAll('.page');
    
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            const pageId = button.dataset.page;
            pages.forEach(page => page.classList.remove('active'));
            document.getElementById(`${pageId}-page`).classList.add('active');
            
            // Обновляем данные при переходе на страницу
            if (pageId === 'profile' && currentUser) {
                loadProfileData();
            } else if (pageId === 'feedback' && currentUser) {
                loadMyFeedback();
            }
        });
    });
    
    // Обработка хеша в URL (для редиректа после логина)
    const hash = window.location.hash.substring(1);
    if (hash) {
        const btn = document.querySelector(`[data-page="${hash}"]`);
        if (btn) btn.click();
    }
}

// ===============================================
// ССЫЛКИ
// ===============================================

function initializeLinks() {
    const mrpRulesLink = document.getElementById('mrpRulesLink');
    if (mrpRulesLink) mrpRulesLink.href = CONFIG.LINKS.mrpRules;
}

// ===============================================
// АВТОРИЗАЦИЯ
// ===============================================

async function loadUserData() {
    try {
        const response = await fetch('/api/user');
        const data = await response.json();
        
        if (data.authenticated) {
            currentUser = data;
            updateAuthUI(data);
            showProfileContent();
            showFeedbackContent();
        } else {
            currentUser = null;
            updateAuthUI(null);
            hideProfileContent();
            hideFeedbackContent();
        }
    } catch (error) {
        console.error('Ошибка загрузки данных пользователя:', error);
    }
}

function updateAuthUI(user) {
    const authBlock = document.getElementById('authBlock');
    
    if (user) {
        authBlock.innerHTML = `
            <div class="auth-user">
                <img src="${user.avatar}" class="user-avatar" alt="${user.displayName}">
                <span style="color: ${user.roleInfo.color}; font-weight: 600;">${user.displayName}</span>
                <a href="/auth/logout" class="auth-logout">Выйти</a>
            </div>
        `;
    } else {
        authBlock.innerHTML = `
            <a href="/auth/steam" class="steam-login-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM8.5 16.5L6 15.3C6.4 16.5 7.6 17.4 9 17.4C10.7 17.4 12 16.1 12 14.4C12 12.7 10.7 11.4 9 11.4C8.2 11.4 7.5 11.7 7 12.2L9.5 13.1C10.3 13.4 10.7 14.3 10.4 15.1C10.1 15.9 9.2 16.3 8.5 16.5ZM18 12C18 15.3 15.3 18 12 18C11.4 18 10.8 17.9 10.3 17.7L11.8 18.3C14.1 19.2 16.7 18.1 17.6 15.8C18.5 13.5 17.4 10.9 15.1 10L13.6 9.4C14.1 9.2 14.7 9 15.3 9C16.9 9 18 10.1 18 11.7V12Z"/>
                </svg>
                Войти через Steam
            </a>
        `;
    }
}

// ===============================================
// ПРОФИЛЬ
// ===============================================

function showProfileContent() {
    document.getElementById('profileNotAuth').style.display = 'none';
    document.getElementById('profileAuth').style.display = 'block';
}

function hideProfileContent() {
    document.getElementById('profileNotAuth').style.display = 'flex';
    document.getElementById('profileAuth').style.display = 'none';
}

async function loadProfileData() {
    if (!currentUser) return;
    
    // Обновляем основные данные профиля
    document.getElementById('profileAvatar').src = currentUser.avatar;
    document.getElementById('profileName').textContent = currentUser.displayName;
    document.getElementById('profileRole').innerHTML = `
        <span style="color: ${currentUser.roleInfo.color};">
            ${currentUser.roleInfo.name}
        </span>
    `;
    document.getElementById('profileSteamID').textContent = `Steam ID: ${currentUser.steamID}`;
    
    // Загружаем статистику
    try {
        const response = await fetch(`/api/stats/${currentUser.steamID}`);
        const stats = await response.json();
        
        const playTimeHours = Math.floor(stats.playTime / 3600);
        const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2);
        
        document.getElementById('statPlayTime').textContent = `${playTimeHours} ч.`;
        document.getElementById('statKills').textContent = stats.kills || 0;
        document.getElementById('statDeaths').textContent = stats.deaths || 0;
        document.getElementById('statEscapes').textContent = stats.escapes || 0;
        document.getElementById('statGames').textContent = stats.gamesPlayed || 0;
        document.getElementById('statKD').textContent = kd;
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
    
    // Показываем админ-панель если нужно
    if (currentUser.roleInfo.level >= 3) {
        await loadAdminPanel();
    }
}

async function loadAdminPanel() {
    try {
        const response = await fetch('/api/admin/users');
        const users = await response.json();
        
        const adminPanel = document.getElementById('adminPanel');
        const usersList = document.getElementById('adminUsersList');
        
        adminPanel.style.display = 'block';
        
        usersList.innerHTML = users.map(user => `
            <div class="admin-user-item">
                <img src="${user.avatar}" alt="${user.displayName}">
                <div class="admin-user-info">
                    <strong>${user.displayName}</strong>
                    <span class="admin-user-id">${user.steamID}</span>
                </div>
                <div class="admin-user-role" style="color: ${user.roleInfo.color};">
                    ${user.roleInfo.name}
                </div>
                ${currentUser.role === 'OWNER' ? `
                    <select class="admin-role-select" data-steamid="${user.steamID}">
                        <option value="PLAYER" ${user.role === 'PLAYER' ? 'selected' : ''}>Игрок</option>
                        <option value="VIP" ${user.role === 'VIP' ? 'selected' : ''}>VIP</option>
                        <option value="MODERATOR" ${user.role === 'MODERATOR' ? 'selected' : ''}>Модератор</option>
                        <option value="ADMIN" ${user.role === 'ADMIN' ? 'selected' : ''}>Администратор</option>
                        ${currentUser.steamID !== user.steamID ? `<option value="OWNER" ${user.role === 'OWNER' ? 'selected' : ''}>Владелец</option>` : ''}
                    </select>
                ` : ''}
            </div>
        `).join('');
        
        // Обработчики изменения роли
        if (currentUser.role === 'OWNER') {
            document.querySelectorAll('.admin-role-select').forEach(select => {
                select.addEventListener('change', async (e) => {
                    const steamID = e.target.dataset.steamid;
                    const newRole = e.target.value;
                    await changeUserRole(steamID, newRole);
                });
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки админ-панели:', error);
    }
}

async function changeUserRole(steamID, newRole) {
    try {
        const response = await fetch('/api/admin/change-role', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ steamID, newRole })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Роль успешно изменена!', 'success');
            await loadAdminPanel();
        } else {
            showNotification('Ошибка изменения роли: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Ошибка сети', 'error');
    }
}

// ===============================================
// ОБРАТНАЯ СВЯЗЬ
// ===============================================

function showFeedbackContent() {
    document.getElementById('feedbackNotAuth').style.display = 'none';
    document.getElementById('feedbackAuth').style.display = 'block';
}

function hideFeedbackContent() {
    document.getElementById('feedbackNotAuth').style.display = 'flex';
    document.getElementById('feedbackAuth').style.display = 'none';
}

async function handleFeedbackSubmit(e) {
    e.preventDefault();
    
    const type = document.getElementById('feedbackType').value;
    const message = document.getElementById('feedbackMessage').value;
    
    if (!message.trim()) {
        showNotification('Сообщение не может быть пустым', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type, message })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Обратная связь отправлена!', 'success');
            document.getElementById('feedbackForm').reset();
            await loadMyFeedback();
        } else {
            showNotification('Ошибка: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Ошибка сети', 'error');
    }
}

async function loadMyFeedback() {
    try {
        const response = await fetch('/api/feedback/my');
        const feedback = await response.json();
        
        const listContainer = document.getElementById('myFeedbackList');
        
        if (feedback.length === 0) {
            listContainer.innerHTML = '<p class="no-feedback">У вас пока нет сообщений</p>';
            return;
        }
        
        listContainer.innerHTML = feedback.map(item => `
            <div class="feedback-item status-${item.status}">
                <div class="feedback-header">
                    <span class="feedback-type">${getFeedbackTypeIcon(item.type)} ${getFeedbackTypeName(item.type)}</span>
                    <span class="feedback-status">${getFeedbackStatusName(item.status)}</span>
                    <span class="feedback-date">${formatDate(item.createdAt)}</span>
                </div>
                <div class="feedback-message">${item.message}</div>
                ${item.replies.length > 0 ? `
                    <div class="feedback-replies">
                        <strong>Ответы:</strong>
                        ${item.replies.map(reply => `
                            <div class="feedback-reply">
                                <strong>${reply.author}:</strong> ${reply.message}
                                <span class="reply-date">${formatDate(reply.createdAt)}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки обратной связи:', error);
    }
}

function getFeedbackTypeIcon(type) {
    const icons = {
        bug: '🐛',
        suggestion: '💡',
        question: '❓',
        other: '📝'
    };
    return icons[type] || '📝';
}

function getFeedbackTypeName(type) {
    const names = {
        bug: 'Баг',
        suggestion: 'Предложение',
        question: 'Вопрос',
        other: 'Другое'
    };
    return names[type] || 'Другое';
}

function getFeedbackStatusName(status) {
    const names = {
        new: 'Новое',
        in_progress: 'В работе',
        resolved: 'Решено',
        closed: 'Закрыто'
    };
    return names[status] || status;
}

// ===============================================
// СТАТУС СЕРВЕРА
// ===============================================

async function loadServerStatus() {
    try {
        const response = await fetch('/api/server/status');
        serverStatus = await response.json();
        
        updateServerUI(serverStatus);
    } catch (error) {
        console.error('Ошибка загрузки статуса сервера:', error);
        updateServerUI({ online: false });
    }
}

function updateServerUI(status) {
    const statusBadge = document.getElementById('serverStatus');
    const mapValue = document.getElementById('serverMap');
    const playersValue = document.getElementById('serverPlayers');
    
    if (status.online) {
        statusBadge.textContent = 'ОНЛАЙН';
        statusBadge.className = 'server-status-badge online';
        mapValue.textContent = status.map || 'Facility';
        playersValue.textContent = `${status.players}/${status.maxPlayers}`;
    } else {
        statusBadge.textContent = 'ОФФЛАЙН';
        statusBadge.className = 'server-status-badge offline';
        mapValue.textContent = 'Недоступно';
        playersValue.textContent = '-/-';
    }
}

// ===============================================
// ПОДКЛЮЧЕНИЕ К СЕРВЕРУ
// ===============================================

function connectToServer() {
    const command = '193.164.17.26:7777';
    
    navigator.clipboard.writeText(command).then(() => {
        showNotification(`IP скопирован! Вставьте в консоль игры (F3): ${command}`, 'success');
    }).catch(() => {
        showNotification('Не удалось скопировать IP', 'error');
    });
}

// Глобальная функция для HTML
window.connectToServer = connectToServer;

// ===============================================
// УТИЛИТЫ
// ===============================================

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${icon}</span>
            <div class="notification-text">
                <p>${message}</p>
            </div>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} дн. назад`;
    if (hours > 0) return `${hours} ч. назад`;
    if (minutes > 0) return `${minutes} мин. назад`;
    return 'только что';
}

console.log('🎮 Абсолютиты SCP:SL | Скрипт загружен');
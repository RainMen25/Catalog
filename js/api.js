const API_BASE = 'https://ofb-catalog-api.8cctq5y6ty.workers.dev/api';

const tg = window.Telegram?.WebApp;

function getDeviceId() {
    let id = localStorage.getItem('ofb_device_id');
    if (!id) {
        id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        localStorage.setItem('ofb_device_id', id);
    }
    return id;
}

function getTelegramUser() {
    if (tg?.initDataUnsafe?.user) {
        return {
            id: tg.initDataUnsafe.user.id,
            first_name: tg.initDataUnsafe.user.first_name,
            last_name: tg.initDataUnsafe.user.last_name || '',
            username: tg.initDataUnsafe.user.username || '',
            photo_url: tg.initDataUnsafe.user.photo_url || ''
        };
    }
    return {
        id: Date.now(),
        first_name: 'User',
        last_name: '',
        username: '',
        photo_url: ''
    };
}

async function apiRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        }
    };

    if (tg?.initData) {
        options.headers['X-Telegram-Init-Data'] = tg.initData;
    } else {
        // Browser: use verified Telegram Widget auth if available
        const widgetAuth = localStorage.getItem('ofb_tg_widget_auth');
        if (widgetAuth) {
            options.headers['X-Telegram-Widget-Auth'] = widgetAuth;
        } else {
            options.headers['X-Device-ID'] = getDeviceId();
        }
    }

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'API Error');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

async function uploadImage(file) {
    const formData = new FormData();
    formData.append('image', file);

    try {
        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            headers: {
                'X-Telegram-Init-Data': tg?.initData || ''
            },
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Upload Error');
        }

        return data.url;
    } catch (error) {
        console.error('Upload Error:', error);
        throw error;
    }
}

// Listings
async function getListings(category = 'all', search = '') {
    const params = new URLSearchParams();
    if (category !== 'all') params.append('category', category);
    if (search) params.append('search', search);
    return apiRequest(`/listings?${params.toString()}`);
}

async function getPremiumListings() {
    return apiRequest('/listings/premium');
}

async function createListing(data) {
    return apiRequest('/listings', 'POST', data);
}

async function getListing(id) {
    return apiRequest(`/listings/${id}`);
}

// Jobs
async function getJobs(category = 'all', search = '') {
    const params = new URLSearchParams();
    if (category !== 'all') params.append('category', category);
    if (search) params.append('search', search);
    return apiRequest(`/jobs?${params.toString()}`);
}

async function createJob(data) {
    return apiRequest('/jobs', 'POST', data);
}

// Ratings
async function submitRating(listingId, rating, comment) {
    return apiRequest(`/listings/${listingId}/ratings`, 'POST', { rating, comment });
}

async function getRatings(listingId) {
    return apiRequest(`/listings/${listingId}/ratings`);
}

// Complaints
async function submitComplaint(listingId, reason, details) {
    return apiRequest(`/listings/${listingId}/complaints`, 'POST', { reason, details });
}

// Profile
async function getProfile() {
    return apiRequest('/profile');
}

async function updateProfile(data) {
    return apiRequest('/profile', 'PUT', data);
}

async function getMyListings() {
    return apiRequest('/profile/listings');
}

async function deleteListing(id) {
    return apiRequest(`/listings/${id}`, 'DELETE');
}

async function deleteJob(id) {
    return apiRequest(`/jobs/${id}`, 'DELETE');
}

// Favorites
async function getFavorites() {
    return apiRequest('/favorites');
}

async function toggleFavorite(listingId) {
    return apiRequest(`/favorites/${listingId}`, 'POST');
}

async function checkFavorite(listingId) {
    return apiRequest(`/favorites/check/${listingId}`);
}

// Notifications
async function getNotifications() {
    return apiRequest('/notifications');
}

async function markNotificationsRead() {
    return apiRequest('/notifications/read', 'POST');
}

// Subscriptions
async function getSubscriptions() {
    return apiRequest('/subscriptions');
}

async function toggleSubscription(category) {
    return apiRequest(`/subscriptions/${category}`, 'POST');
}

// Open to work toggle
async function toggleListingAvailable(id) {
    return apiRequest(`/listings/${id}/available`, 'POST');
}

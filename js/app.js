let currentListingId = null;
let currentRating = 0;
let listingsData = [];
let jobsData = [];
let favoritesData = [];

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
        window.Telegram.WebApp.setHeaderColor('#0a0a0a');
        window.Telegram.WebApp.setBackgroundColor('#0a0a0a');
    }

    const savedLang = localStorage.getItem('ofb_language');
    if (savedLang) {
        setLanguage(savedLang);
    }

    // Load saved theme
    const savedTheme = localStorage.getItem('ofb_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
});

// Theme toggle
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('ofb_theme', newTheme);
}

function showMainApp() {
    document.getElementById('language-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('main-app').classList.add('active');
    applyTranslations();
    loadListings();
    loadNotificationCount();
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.add('hidden');
    });

    document.getElementById(`${tab}-tab`).classList.remove('hidden');

    if (tab === 'exchange') {
        loadListings();
    } else if (tab === 'jobs') {
        loadJobs();
    } else if (tab === 'favorites') {
        loadFavorites();
    }
}

function switchCreateTab(type) {
    document.querySelectorAll('.create-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    document.getElementById('create-listing-form').classList.toggle('hidden', type !== 'listing');
    document.getElementById('create-job-form').classList.toggle('hidden', type !== 'job');
}

// Load listings
async function loadListings() {
    try {
        const [premium, regular] = await Promise.all([
            getPremiumListings(),
            getListings()
        ]);

        renderPremiumListings(premium.data || []);
        renderListings(regular.data || []);
        listingsData = [...(premium.data || []), ...(regular.data || [])];
    } catch (error) {
        console.error('Failed to load listings:', error);
    }
}

function renderPremiumListings(listings) {
    const container = document.getElementById('premium-listings');
    container.innerHTML = '';

    listings.forEach(listing => {
        container.appendChild(createListingCard(listing, true));
    });
}

function renderListings(listings) {
    const container = document.getElementById('listings-container');
    const noResults = document.getElementById('no-listings');

    container.innerHTML = '';

    if (listings.length === 0) {
        noResults.classList.remove('hidden');
        return;
    }

    noResults.classList.add('hidden');
    listings.forEach(listing => {
        container.appendChild(createListingCard(listing, false));
    });
}

function createListingCard(listing, isPremium) {
    const card = document.createElement('div');
    card.className = `listing-card${listing.is_scam ? ' scam' : ''}${isPremium ? ' premium-card' : ''}`;

    const avatarHtml = listing.avatar
        ? `<img src="${listing.avatar}" alt="${listing.name}">`
        : `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
             <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
             <circle cx="8.5" cy="8.5" r="1.5"></circle>
             <polyline points="21 15 16 10 5 21"></polyline>
           </svg>`;

    const rating = listing.avg_rating ? listing.avg_rating.toFixed(1) : '0';
    const roundedRating = Math.round(listing.avg_rating || 0);

    // Hearts instead of stars: 🖤 (1-2), 💚 (3-4), ❤️ (5)
    let heartsHtml = '';
    for (let i = 1; i <= 5; i++) {
        const filled = i <= roundedRating;
        let heart = '🤍';
        if (filled && !listing.is_scam) {
            if (roundedRating <= 2) heart = '🖤';
            else if (roundedRating <= 4) heart = '💚';
            else heart = '❤️';
        }
        heartsHtml += heart;
    }

    const verifiedBadge = listing.is_verified ?
        `<span class="verified-badge">
            <svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            ${t('verified_badge')}
        </span>` : '';

    card.innerHTML = `
        ${isPremium ? `<span class="premium-badge">${t('premium_badge')}</span>` : ''}
        <button class="favorite-btn" onclick="event.stopPropagation(); toggleFavoriteAction(${listing.id})">
            <svg viewBox="0 0 24 24" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
        </button>
        <div class="listing-header" onclick="showListingDetail(${listing.id})">
            <div class="listing-avatar">${avatarHtml}</div>
            <div class="listing-info">
                <div class="listing-name">
                    ${listing.name}
                    ${listing.is_scam ? `<span class="scam-badge-small">${t('scam_badge')}</span>` : ''}
                    ${verifiedBadge}
                </div>
                <span class="listing-category">${t('cat_' + listing.category) || listing.category}</span>
            </div>
        </div>
        <p class="listing-description" onclick="showListingDetail(${listing.id})">${listing.description}</p>
        <div class="listing-footer" onclick="showListingDetail(${listing.id})">
            <div class="listing-rating">
                <span>${heartsHtml}</span>
                <span>${listing.is_scam ? '-' : rating}</span>
            </div>
            <span class="listing-telegram">@${listing.telegram}</span>
        </div>
    `;

    checkFavoriteStatus(listing.id, card.querySelector('.favorite-btn'));
    return card;
}

async function checkFavoriteStatus(listingId, button) {
    try {
        const result = await checkFavorite(listingId);
        if (result.isFavorite) {
            button.classList.add('active');
        }
    } catch (error) {
        console.error('Failed to check favorite:', error);
    }
}

async function toggleFavoriteAction(listingId) {
    try {
        const result = await toggleFavorite(listingId);
        const buttons = document.querySelectorAll(`.favorite-btn`);
        buttons.forEach(btn => {
            const card = btn.closest('.listing-card');
            if (card) {
                const onclickAttr = btn.getAttribute('onclick');
                if (onclickAttr && onclickAttr.includes(listingId)) {
                    if (result.action === 'added') {
                        btn.classList.add('active');
                        showToast(t('toast_favorite_added'), 'success');
                    } else {
                        btn.classList.remove('active');
                        showToast(t('toast_favorite_removed'), 'success');
                    }
                }
            }
        });
    } catch (error) {
        showToast(t('toast_error'), 'error');
    }
}

// Filter listings
async function filterListings() {
    const category = document.getElementById('category-filter').value;
    const search = document.getElementById('search-input').value;

    try {
        const result = await getListings(category, search);
        renderListings(result.data || []);
    } catch (error) {
        console.error('Failed to filter listings:', error);
    }
}

// Load jobs
async function loadJobs() {
    try {
        const result = await getJobs();
        jobsData = result.data || [];
        renderJobs(jobsData);
    } catch (error) {
        console.error('Failed to load jobs:', error);
    }
}

function renderJobs(jobs) {
    const container = document.getElementById('jobs-container');
    const noResults = document.getElementById('no-jobs');

    container.innerHTML = '';

    if (jobs.length === 0) {
        noResults.classList.remove('hidden');
        return;
    }

    noResults.classList.add('hidden');
    jobs.forEach(job => {
        container.appendChild(createJobCard(job));
    });
}

function createJobCard(job) {
    const card = document.createElement('div');
    card.className = 'listing-card';

    card.innerHTML = `
        <div class="listing-header">
            <div class="listing-avatar">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
            </div>
            <div class="listing-info">
                <div class="listing-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">${job.name}</div>
                <span class="listing-category">${t('cat_' + job.category) || job.category}</span>
            </div>
        </div>
        <p class="listing-description" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;max-height:3em;">${job.description}</p>
        <div class="listing-footer">
            <span class="listing-telegram">@${job.telegram}</span>
        </div>
    `;

    card.onclick = () => showJobModal(job);

    return card;
}

// Job Modal
function showJobModal(job) {
    const existingModal = document.getElementById('job-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'job-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-card" onclick="event.stopPropagation()" style="max-width: 500px;">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 20px; border-bottom: 1px solid var(--border);">
                <h3>${t('tab_jobs')}</h3>
                <button onclick="closeJobModal()" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 24px;">×</button>
            </div>
            <div style="padding: 20px;">
                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
                    <div style="width: 60px; height: 60px; border-radius: 50%; background: var(--bg-input); display: flex; align-items: center; justify-content: center;">
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                    </div>
                    <div>
                        <h3 style="margin-bottom: 5px;">${job.name}</h3>
                        <span style="color: var(--text-secondary); font-size: 14px;">${t('cat_' + job.category) || job.category}</span>
                    </div>
                </div>
                <div style="background: var(--bg-input); padding: 15px; border-radius: var(--radius-sm); margin-bottom: 20px; line-height: 1.6;">
                    ${job.description}
                </div>
            </div>
            <div style="padding: 20px; border-top: 1px solid var(--border); display: flex; gap: 10px;">
                <button onclick="window.open('https://t.me/${job.telegram}', '_blank')" style="
                    flex: 1; padding: 14px; background: var(--accent); border: none;
                    border-radius: var(--radius-sm); color: #000; font-size: 14px;
                    font-weight: 600; cursor: pointer; display: flex;
                    align-items: center; justify-content: center; gap: 8px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                    </svg>
                    @${job.telegram}
                </button>
                <button onclick="closeJobModal()" style="
                    padding: 14px 20px; background: var(--bg-input); border: 1px solid var(--border);
                    border-radius: var(--radius-sm); color: var(--text-primary); cursor: pointer;">
                    ✕
                </button>
            </div>
        </div>
    `;

    modal.onclick = () => closeJobModal();
    document.body.appendChild(modal);
}

function closeJobModal() {
    const modal = document.getElementById('job-modal');
    if (modal) modal.remove();
}

async function filterJobs() {
    const category = document.getElementById('job-category-filter').value;

    try {
        const result = await getJobs(category);
        renderJobs(result.data || []);
    } catch (error) {
        console.error('Failed to filter jobs:', error);
    }
}

// Create listing
async function submitListing(event) {
    event.preventDefault();

    const name = document.getElementById('listing-name').value;
    const description = document.getElementById('listing-description').value;
    const category = document.getElementById('listing-category').value;
    const telegram = document.getElementById('listing-telegram').value.replace('@', '');
    const avatarInput = document.getElementById('listing-avatar');

    let avatarUrl = '';

    if (avatarInput.files[0]) {
        try {
            avatarUrl = await uploadImage(avatarInput.files[0]);
        } catch (error) {
            showToast(t('toast_error'), 'error');
            return;
        }
    }

    try {
        await createListing({
            name,
            description,
            category,
            telegram,
            avatar: avatarUrl,
            user: getTelegramUser()
        });

        showToast(t('toast_listing_created'), 'success');
        document.getElementById('create-listing-form').reset();
        document.getElementById('listing-avatar-preview').innerHTML = `
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
        `;
    } catch (error) {
        showToast(t('toast_error'), 'error');
    }
}

// Create job
async function submitJob(event) {
    event.preventDefault();

    const name = document.getElementById('job-name').value;
    const description = document.getElementById('job-description').value;
    const category = document.getElementById('job-category').value;
    const telegram = document.getElementById('job-telegram').value.replace('@', '');

    try {
        await createJob({
            name,
            description,
            category,
            telegram,
            user: getTelegramUser()
        });

        showToast(t('toast_job_created'), 'success');
        document.getElementById('create-job-form').reset();
    } catch (error) {
        showToast(t('toast_error'), 'error');
    }
}

// Listing detail
async function showListingDetail(id) {
    currentListingId = id;

    try {
        const listing = await getListing(id);
        const ratings = await getRatings(id);

        document.getElementById('detail-name').textContent = listing.name;
        document.getElementById('detail-category').textContent = t('cat_' + listing.category) || listing.category;
        document.getElementById('detail-description').textContent = listing.description;

        if (listing.is_scam) {
            document.getElementById('detail-scam').classList.remove('hidden');
        } else {
            document.getElementById('detail-scam').classList.add('hidden');
        }

        if (listing.avatar) {
            document.getElementById('detail-avatar').innerHTML = `<img src="${listing.avatar}" alt="${listing.name}">`;
        }

        renderReviews(ratings.data || []);

        document.getElementById('main-app').classList.add('hidden');
        document.getElementById('listing-detail').classList.remove('hidden');
    } catch (error) {
        showToast(t('toast_error'), 'error');
    }
}

function closeListingDetail() {
    document.getElementById('listing-detail').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    currentListingId = null;
    currentRating = 0;
    resetStars();
}

function contactUser() {
    const telegram = document.querySelector('#detail-name').textContent;
    const listing = listingsData.find(l => l.id === currentListingId);
    if (listing?.telegram) {
        window.open(`https://t.me/${listing.telegram}`, '_blank');
    }
}

// Rating with hearts
function setRating(rating) {
    currentRating = rating;
    const hearts = document.querySelectorAll('#rating-stars .star');
    hearts.forEach((heart, index) => {
        if (index < rating) {
            if (rating <= 2) heart.textContent = '🖤';
            else if (rating <= 4) heart.textContent = '💚';
            else heart.textContent = '❤️';
        } else {
            heart.textContent = '🤍';
        }
    });
}

function resetStars() {
    document.querySelectorAll('#rating-stars .star').forEach(heart => {
        heart.textContent = '🤍';
    });
    document.getElementById('rating-comment').value = '';
}

async function submitRating() {
    if (!currentRating) {
        showToast(t('toast_error'), 'error');
        return;
    }

    const comment = document.getElementById('rating-comment').value;

    try {
        await submitRating(currentListingId, currentRating, comment);
        showToast(t('toast_rating_saved'), 'success');
        resetStars();

        const ratings = await getRatings(currentListingId);
        renderReviews(ratings.data || []);
    } catch (error) {
        showToast(t('toast_error'), 'error');
    }
}

function renderReviews(reviews) {
    const container = document.getElementById('reviews-list');
    container.innerHTML = '';

    reviews.forEach(review => {
        const card = document.createElement('div');
        card.className = 'review-card';

        const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
        const date = new Date(review.created_at).toLocaleDateString();

        card.innerHTML = `
            <div class="review-header">
                <span class="review-author">${review.user_name || 'User'}</span>
                <span class="review-rating">${stars}</span>
            </div>
            ${review.comment ? `<p class="review-text">${review.comment}</p>` : ''}
            <span class="review-date">${date}</span>
        `;

        container.appendChild(card);
    });
}

// Complaint
function showComplaintForm() {
    document.getElementById('complaint-modal').classList.remove('hidden');
}

function closeComplaintModal() {
    document.getElementById('complaint-modal').classList.add('hidden');
    document.getElementById('complaint-details').value = '';
    document.querySelectorAll('input[name="complaint-reason"]').forEach(r => r.checked = false);
}

async function submitComplaint() {
    const reason = document.querySelector('input[name="complaint-reason"]:checked')?.value;
    const details = document.getElementById('complaint-details').value;

    if (!reason) {
        showToast(t('toast_error'), 'error');
        return;
    }

    try {
        await submitComplaint(currentListingId, reason, details);
        showToast(t('toast_complaint_sent'), 'success');
        closeComplaintModal();
    } catch (error) {
        showToast(t('toast_error'), 'error');
    }
}

// Profile
function showProfile() {
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('profile-screen').classList.remove('hidden');
    loadProfile();
}

function closeProfile() {
    document.getElementById('profile-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
}

async function loadProfile() {
    try {
        const profile = await getProfile();

        document.getElementById('profile-name').textContent = profile.name || 'User';
        document.getElementById('profile-telegram').textContent = profile.telegram ? `@${profile.telegram}` : '';
        document.getElementById('profile-rating').textContent = profile.avg_rating?.toFixed(1) || '0';
        document.getElementById('profile-reviews').textContent = profile.reviews_count || '0';

        if (profile.avatar) {
            document.getElementById('profile-avatar').innerHTML = `<img src="${profile.avatar}" alt="Avatar">`;
        }
    } catch (error) {
        console.error('Failed to load profile:', error);
    }
}

// Edit profile
function showEditProfile() {
    document.getElementById('profile-screen').classList.add('hidden');
    document.getElementById('edit-profile-screen').classList.remove('hidden');
    loadEditProfile();
}

function closeEditProfile() {
    document.getElementById('edit-profile-screen').classList.add('hidden');
    document.getElementById('profile-screen').classList.remove('hidden');
}

async function loadEditProfile() {
    try {
        const profile = await getProfile();

        document.getElementById('edit-name').value = profile.name || '';
        document.getElementById('edit-telegram').value = profile.telegram || '';
        document.getElementById('edit-description').value = profile.description || '';

        if (profile.avatar) {
            document.getElementById('edit-avatar-preview').innerHTML = `<img src="${profile.avatar}" alt="Avatar">`;
        }
    } catch (error) {
        console.error('Failed to load profile:', error);
    }
}

async function saveProfile(event) {
    event.preventDefault();

    const name = document.getElementById('edit-name').value;
    const telegram = document.getElementById('edit-telegram').value.replace('@', '');
    const description = document.getElementById('edit-description').value;
    const avatarInput = document.getElementById('edit-avatar');

    let avatarUrl = '';

    if (avatarInput.files[0]) {
        try {
            avatarUrl = await uploadImage(avatarInput.files[0]);
        } catch (error) {
            showToast(t('toast_error'), 'error');
            return;
        }
    }

    try {
        await updateProfile({
            name,
            telegram,
            description,
            avatar: avatarUrl || undefined
        });

        showToast(t('toast_profile_saved'), 'success');
        closeEditProfile();
        loadProfile();
    } catch (error) {
        showToast(t('toast_error'), 'error');
    }
}

function showMyListings() {
    // TODO: Implement my listings view
    showToast('Coming soon');
}

// Avatar preview
function previewAvatar(input, previewId) {
    const preview = document.getElementById(previewId);
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// Share listing
function shareListing() {
    const listing = window.currentListingData || listingsData.find(l => l.id === currentListingId);
    if (!listing) return;
    const text = `🔥 ${listing.name}\n\n📂 ${listing.category}\n⭐ ${listing.avg_rating ? listing.avg_rating.toFixed(1) : 'Нет оценок'}\n\n${listing.description.substring(0, 100)}...\n\n👉 @${listing.telegram}`;
    if (navigator.share) {
        navigator.share({ title: listing.name, text: text });
    } else {
        navigator.clipboard.writeText(text).then(() => showToast('Скопировано!', 'success'));
    }
}

// Premium popup for limit
function showPremiumPopup() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-card" onclick="event.stopPropagation()" style="max-width: 400px;">
            <div style="padding: 30px; text-align: center;">
                <div style="font-size: 60px; margin-bottom: 20px;">🚀</div>
                <h3 style="margin-bottom: 10px;">Лимит заявок</h3>
                <p style="color: var(--text-secondary); margin-bottom: 25px;">
                    Свяжитесь с нами для получения премиум доступа!
                </p>
                <button onclick="window.open('https://t.me/ValentinOnlyFans', '_blank')" style="
                    width: 100%; padding: 16px; background: var(--accent); border: none;
                    border-radius: var(--radius-sm); color: #000; font-size: 16px;
                    font-weight: 600; cursor: pointer;">
                    Написать @ValentinOnlyFans
                </button>
                <button onclick="this.closest('.modal-overlay').remove()" style="
                    margin-top: 10px; padding: 12px; background: var(--bg-input);
                    border: 1px solid var(--border); border-radius: var(--radius-sm);
                    color: var(--text-primary); cursor: pointer; width: 100%;">
                    Закрыть
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// Toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// Favorites
async function loadFavorites() {
    try {
        const result = await getFavorites();
        favoritesData = result.data || [];
        renderFavorites(favoritesData);
    } catch (error) {
        console.error('Failed to load favorites:', error);
    }
}

function renderFavorites(favorites) {
    const container = document.getElementById('favorites-container');
    const noResults = document.getElementById('no-favorites');

    container.innerHTML = '';

    if (favorites.length === 0) {
        noResults.classList.remove('hidden');
        return;
    }

    noResults.classList.add('hidden');
    favorites.forEach(listing => {
        const card = createListingCard(listing, false);
        container.appendChild(card);
    });
}

// Notifications
async function loadNotificationCount() {
    try {
        const result = await getNotifications();
        const badge = document.getElementById('notification-badge');
        if (result.unread > 0) {
            badge.textContent = result.unread > 99 ? '99+' : result.unread;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    } catch (error) {
        console.error('Failed to load notification count:', error);
    }
}

function showNotifications() {
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('notifications-screen').classList.remove('hidden');
    loadNotifications();
}

function closeNotifications() {
    document.getElementById('notifications-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
}

async function loadNotifications() {
    try {
        const result = await getNotifications();
        renderNotifications(result.data || []);

        // Mark as read
        await markNotificationsRead();
        document.getElementById('notification-badge').classList.add('hidden');
    } catch (error) {
        console.error('Failed to load notifications:', error);
    }
}

function renderNotifications(notifications) {
    const container = document.getElementById('notifications-list');
    const noResults = document.getElementById('no-notifications');

    container.innerHTML = '';

    if (notifications.length === 0) {
        noResults.classList.remove('hidden');
        return;
    }

    noResults.classList.add('hidden');
    notifications.forEach(notif => {
        const item = document.createElement('div');
        item.className = `notification-item${notif.is_read ? '' : ' unread'}`;

        const icon = getNotificationIcon(notif.type);
        const time = formatTime(notif.created_at);

        item.innerHTML = `
            <div class="notification-icon">${icon}</div>
            <div class="notification-content">
                <p class="notification-text">${getNotificationText(notif)}</p>
                <span class="notification-time">${time}</span>
            </div>
        `;

        container.appendChild(item);
    });
}

function getNotificationIcon(type) {
    switch (type) {
        case 'listing_approved':
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
        case 'listing_rejected':
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
        case 'new_rating':
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
        default:
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>';
    }
}

function getNotificationText(notif) {
    const data = JSON.parse(notif.data);
    switch (notif.type) {
        case 'listing_approved':
            return `Ваша заявка "${data.name}" одобрена`;
        case 'listing_rejected':
            return `Ваша заявка "${data.name}" отклонена`;
        case 'new_rating':
            return `Новый отзыв на вашу заявку`;
        case 'premium_activated':
            return `Премиум активирован для "${data.name}"`;
        case 'premium_expired':
            return `Премиум истёк для "${data.name}"`;
        default:
            return notif.type;
    }
}

function formatTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Только что';
    if (minutes < 60) return `${minutes} мин. назад`;
    if (hours < 24) return `${hours} ч. назад`;
    if (days < 7) return `${days} дн. назад`;

    return date.toLocaleDateString();
}

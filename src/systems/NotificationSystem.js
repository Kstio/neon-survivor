import { playSound } from '../sounds.js';

class HUDNotificationManager {
    constructor() {
        this.queue = [];
        this.isDisplaying = false;
        this.container = null;
    }

    ensureContainer() {
        if (!this.container) {
            this.container = document.getElementById('achievement-toast-container');
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.id = 'achievement-toast-container';
                this.container.className = 'achievement-toast-container';
                document.body.appendChild(this.container);
            }
        }
        return this.container;
    }

    show({ icon = '🏆', name = 'ДИРЕКТИВА', desc = '', reward = 0 }) {
        this.queue.push({ icon, name, desc, reward });
        if (!this.isDisplaying) {
            this.processQueue();
        }
    }

    processQueue() {
        if (this.queue.length === 0) {
            this.isDisplaying = false;
            return;
        }

        this.isDisplaying = true;
        const item = this.queue.shift();
        const container = this.ensureContainer();

        playSound('achievement');

        const toast = document.createElement('div');
        toast.className = 'achievement-toast';

        toast.innerHTML = `
            <div class="achievement-toast__icon-box">
                <span class="achievement-toast__icon">${item.icon}</span>
            </div>
            <div class="achievement-toast__content">
                <div class="achievement-toast__category">
                    <span>>> ДИРЕКТИВА ВЫПОЛНЕНА</span>
                    ${item.reward ? `<span class="achievement-toast__reward">+${item.reward} $</span>` : ''}
                </div>
                <div class="achievement-toast__title">${item.name}</div>
                <div class="achievement-toast__desc">${item.desc}</div>
            </div>
            <div class="achievement-toast__progress-bar"></div>
        `;

        container.appendChild(toast);

        void toast.offsetWidth;
        toast.classList.add('achievement-toast--visible');

        setTimeout(() => {
            toast.classList.remove('achievement-toast--visible');
            toast.classList.add('achievement-toast--closing');

            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }

                setTimeout(() => {
                    this.processQueue();
                }, 150);
            }, 350);
        }, 3000);
    }

    reset() {
        this.queue = [];
        this.isDisplaying = false;
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

export const NotificationSystem = new HUDNotificationManager();

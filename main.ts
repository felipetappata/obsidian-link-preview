import { App, Plugin, PluginSettingTab, Setting, Platform } from 'obsidian';

interface LinkPreviewSettings {
    maxPreviewHeight: number;
    maxPreviewWidth: number;
    hoverDelay: number;
}

const DEFAULT_SETTINGS: Readonly<LinkPreviewSettings> = {
    maxPreviewHeight: 400,
    maxPreviewWidth: 600,
    hoverDelay: 500,
};

export default class LinkPreviewPlugin extends Plugin {
    settings: LinkPreviewSettings;
    private activePreview?: { 
        element: HTMLElement, 
        cleanup: () => void,
        link: HTMLElement 
    };
    private hoverTimeout?: number;

    async onload() {
        await this.loadSettings();
        
        // Defer setup until layout is ready
        this.app.workspace.onLayoutReady(() => {
            this.registerGlobalHandler();
        });
        
        this.addSettingTab(new LinkPreviewSettingTab(this.app, this));
    }

    private registerGlobalHandler() {
        const handleWindow = (doc: Document) => {
            this.registerDomEvent(doc, 'mouseover', this.handleLinkHover.bind(this));
            
            // Handle modifier key for editing mode
            this.registerDomEvent(doc, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === (Platform.isMacOS ? 'Meta' : 'Control')) {
                    this.handleModifierKey(true);
                }
            });
            
            this.registerDomEvent(doc, 'keyup', (evt: KeyboardEvent) => {
                if (evt.key === (Platform.isMacOS ? 'Meta' : 'Control')) {
                    this.handleModifierKey(false);
                }
            });
        };

        handleWindow(document);
        this.registerEvent(
            this.app.workspace.on('window-open', ({win}) => handleWindow(win.document))
        );
    }

    private handleModifierKey(isPressed: boolean) {
        // Handle modifier key state
        const modifierClass = 'link-preview-modifier-pressed';
        if (isPressed) {
            document.body.classList.add(modifierClass);
        } else {
            document.body.classList.remove(modifierClass);
        }
    }

    private handleLinkHover(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!(target instanceof HTMLAnchorElement) || !target.classList.contains('external-link')) return;

        const url = target.href;
        if (!url) return;

        // Clear any existing hover timeout
        if (this.hoverTimeout) {
            window.clearTimeout(this.hoverTimeout);
        }

        // If hovering the same link that has an active preview, do nothing
        if (this.activePreview?.link === target) return;

        // Clean up any existing preview
        this.cleanupActivePreview();

        // Set timeout for showing preview
        this.hoverTimeout = window.setTimeout(() => {
            this.showPreview(target);
        }, this.settings.hoverDelay);

        // Add mouse leave listener to target
        const handleMouseLeave = (e: MouseEvent) => {
            // Check if mouse moved to the preview
            const toElement = e.relatedTarget as HTMLElement;
            if (this.activePreview?.element.contains(toElement)) return;

            this.startCleanupTimer();
            target.removeEventListener('mouseleave', handleMouseLeave);
        };

        target.addEventListener('mouseleave', handleMouseLeave);
    }

    private showPreview(link: HTMLAnchorElement) {
        const url = link.href;
        const rect = link.getBoundingClientRect();
        const previewEl = this.createPreviewElement(rect);
        
        const wrapper = previewEl.createDiv('preview-iframe-wrapper');
        const loading = previewEl.createDiv('preview-loading');
        loading.addClass('loading-spinner'); // Add loading spinner class
        
        const iframe = createEl('iframe', { 
            attr: { 
                src: url,
                style: 'display: none;' // Hide iframe initially
            }
        });
        
        wrapper.appendChild(iframe);

        const cleanup = () => {
            previewEl.remove();
            this.activePreview = undefined;
        };

        iframe.onload = () => {
            iframe.style.display = 'block'; // Show iframe when loaded
            loading.style.display = 'none'; // Hide loading indicator
        };

        iframe.onerror = () => {
            loading.textContent = 'Failed to load preview';
        };

        // Add preview hover handlers
        previewEl.addEventListener('mouseenter', () => {
            if (this.cleanupTimeout) {
                window.clearTimeout(this.cleanupTimeout);
                this.cleanupTimeout = undefined;
            }
        });

        previewEl.addEventListener('mouseleave', () => {
            this.startCleanupTimer();
        });

        document.body.appendChild(previewEl);
        this.activePreview = { element: previewEl, cleanup, link };
    }

    private cleanupTimeout?: number;

    private startCleanupTimer() {
        if (this.cleanupTimeout) {
            window.clearTimeout(this.cleanupTimeout);
        }
        this.cleanupTimeout = window.setTimeout(() => {
            this.cleanupActivePreview();
            this.cleanupTimeout = undefined;
        }, 300);
    }

    private cleanupActivePreview() {
        if (this.activePreview) {
            this.activePreview.cleanup();
            this.activePreview = undefined;
        }
        if (this.hoverTimeout) {
            window.clearTimeout(this.hoverTimeout);
            this.hoverTimeout = undefined;
        }
        if (this.cleanupTimeout) {
            window.clearTimeout(this.cleanupTimeout);
            this.cleanupTimeout = undefined;
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    onunload() {
        this.cleanupActivePreview();
    }

    private createPreviewElement(rect: DOMRect): HTMLElement {
        const el = createEl('div', { cls: 'hover-popup' });
        
        const windowSize = {
            width: window.innerWidth,
            height: window.innerHeight
        };
        
        const bounds = this.calculatePreviewBounds(rect, windowSize);
        
        // Set positioning directly - remove CSS variables approach
        el.style.cssText = `
            left: ${bounds.left}px;
            top: ${bounds.top}px;
            width: ${bounds.width}px;
            height: ${bounds.height}px;
        `;
        
        return el;
    }

    private calculatePreviewBounds(rect: DOMRect, windowSize: { width: number, height: number }): {
        left: number,
        top: number,
        width: number,
        height: number,
        showAbove: boolean
    } {
        const margin = 5; // Margin from edges
        const maxWidth = Math.min(this.settings.maxPreviewWidth, windowSize.width - margin * 2);
        const maxHeight = Math.min(this.settings.maxPreviewHeight, windowSize.height - margin * 2);
        
        // Determine if we should show above or below
        const spaceBelow = windowSize.height - rect.bottom - margin;
        const spaceAbove = rect.top - margin;
        const showAbove = spaceBelow < maxHeight && spaceAbove > spaceBelow;

        // Calculate vertical position
        let top = showAbove ? 
            Math.max(margin, rect.top - maxHeight - margin) : 
            Math.min(rect.bottom + margin, windowSize.height - maxHeight - margin);

        // Calculate horizontal position
        let left = rect.left;
        if (left + maxWidth > windowSize.width - margin) {
            left = windowSize.width - maxWidth - margin;
        }
        left = Math.max(margin, left);

        return {
            left,
            top,
            width: maxWidth,
            height: maxHeight,
            showAbove
        };
    }
}

class LinkPreviewSettingTab extends PluginSettingTab {
    plugin: LinkPreviewPlugin;

    constructor(app: App, plugin: LinkPreviewPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('Hover delay')
            .setDesc('Delay before showing preview (in ms)')
            .addText(text => text
                .setPlaceholder('500')
                .setValue(String(this.plugin.settings.hoverDelay))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue >= 0) {
                        this.plugin.settings.hoverDelay = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Maximum height')
            .setDesc('Maximum height of preview window (in px)')
            .addText(text => text
                .setPlaceholder('300')
                .setValue(String(this.plugin.settings.maxPreviewHeight))
                .onChange(async (value) => {
                    this.plugin.settings.maxPreviewHeight = Number(value);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Maximum width')
            .setDesc('Maximum width of preview window (in px)')
            .addText(text => text
                .setPlaceholder('400')
                .setValue(String(this.plugin.settings.maxPreviewWidth))
                .onChange(async (value) => {
                    this.plugin.settings.maxPreviewWidth = Number(value);
                    await this.plugin.saveSettings();
                }));
    }
}

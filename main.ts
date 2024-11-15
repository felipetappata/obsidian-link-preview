import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

/**
 * Settings interface for the Link Preview plugin
 */
interface LinkPreviewSettings {
    mySetting: string;
    previewDelay: number;
    maxPreviewHeight: number;
    enablePreview: boolean;
    maxPreviewWidth: number;
}

// Default settings values
const DEFAULT_SETTINGS: LinkPreviewSettings = {
    mySetting: 'default',
    previewDelay: 50,
    enablePreview: true,
    maxPreviewHeight: 400,
    maxPreviewWidth: 600
}

/**
 * Link Preview plugin that shows iframe previews of external links on hover
 */
export default class LinkPreviewPlugin extends Plugin {
    settings: LinkPreviewSettings;
    // Track active preview elements by link URL
    private activeLinks: Map<string, HTMLElement> = new Map();

    async onload() {
        await this.loadSettings();

        // Register the hover handler with cleanup
        this.registerDomEvent(document, 'mouseover', (evt: MouseEvent) => {
            const target = evt.target as HTMLElement;
            const linkEl = target.closest('a');
            
            if (!linkEl || !this.settings.enablePreview) return;
            
            if (linkEl.hasClass('external-link')) {
                const rect = linkEl.getBoundingClientRect();
                this.showPreview(linkEl, rect);
            }
        });

        this.addSettingTab(new LinkPreviewSettingTab(this.app, this));
    }

    /**
     * Clean up any remaining previews when plugin is disabled
     */
    onunload() {
        // Clean up any remaining previews
        this.activeLinks.forEach((previewEl, linkId) => {
            previewEl.remove();
        });
        this.activeLinks.clear();
    }

    /**
     * Creates and shows a preview window for a link element
     * @param linkEl - The link element for which to create a preview
     * @param rect - The bounding rectangle of the link element
     */
    private showPreview(linkEl: HTMLElement, rect: DOMRect) {
        const url = linkEl.getAttribute('href');
        if (!url) return;

        const linkId = `preview-${url}`;
        if (this.activeLinks.has(linkId)) return;

        // Create hover element using createEl for security
        const hoverEl = this.createPreviewElement(rect);
        
        // Create loading indicator safely
        const loadingEl = hoverEl.createDiv({cls: 'preview-loading'});
        loadingEl.setText('Loading preview...');
        
        // Create iframe wrapper and iframe safely
        const iframeWrapper = hoverEl.createDiv({cls: 'preview-iframe-wrapper'});
        const iframe = iframeWrapper.createEl('iframe', {
            attr: {
                src: url,
                style: 'display: none; width: 100%; height: 100%; border: none;'
            }
        });

        // Add load event handler before adding iframe to DOM
        iframe.addEventListener('load', () => {
            loadingEl.remove();
            iframe.style.display = 'block';
        });

        iframe.addEventListener('error', () => {
            loadingEl.setText('Failed to load preview');
        });

        // Set up event handlers
        const cleanup = () => {
            this.activeLinks.delete(linkId);
            hoverEl.remove();
            linkEl.removeAttribute('data-preview-active');
        };

        let isLinkHovered = true;
        let isPreviewHovered = false;

        const removePreview = () => {
            if (!isLinkHovered && !isPreviewHovered) {
                cleanup();
            }
        };

        const handleLinkEnter = () => {
            isLinkHovered = true;
        };

        const handleLinkLeave = () => {
            isLinkHovered = false;
            setTimeout(removePreview, 100); // Small delay to allow moving to preview
        };

        const handlePreviewEnter = () => {
            isPreviewHovered = true;
        };

        const handlePreviewLeave = () => {
            isPreviewHovered = false;
            removePreview();
        };

        // Add event listeners
        linkEl.addEventListener('mouseenter', handleLinkEnter);
        linkEl.addEventListener('mouseleave', handleLinkLeave);
        hoverEl.addEventListener('mouseenter', handlePreviewEnter);
        hoverEl.addEventListener('mouseleave', handlePreviewLeave);

        this.activeLinks.set(linkId, hoverEl);
        document.body.appendChild(hoverEl);
    }

    /**
     * Creates the preview container element with proper positioning
     * @param rect - The bounding rectangle used for positioning
     * @returns HTMLElement configured as preview container
     */
    private createPreviewElement(rect: DOMRect): HTMLElement {
        return createEl('div', {
            cls: 'hover-popup',
            attr: {
                style: `
                    position: fixed;
                    left: ${rect.left}px;
                    top: ${rect.bottom + 5}px;
                    z-index: 1000;
                    width: ${this.settings.maxPreviewWidth}px;
                    height: ${this.settings.maxPreviewHeight}px;
                `
            }
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

/**
 * Settings tab for configuring the Link Preview plugin
 */
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
            .setName('Enable preview')
            .setDesc('Toggle link preview functionality')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enablePreview)
                .onChange(async (value) => {
                    this.plugin.settings.enablePreview = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Preview delay')
            .setDesc('How long to wait before showing the preview (in milliseconds)')
            .addText(text => text
                .setPlaceholder('300')
                .setValue(String(this.plugin.settings.previewDelay))
                .onChange(async (value) => {
                    this.plugin.settings.previewDelay = Number(value);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Maximum preview height')
            .setDesc('Maximum height of the preview window (in pixels)')
            .addText(text => text
                .setPlaceholder('300')
                .setValue(String(this.plugin.settings.maxPreviewHeight))
                .onChange(async (value) => {
                    this.plugin.settings.maxPreviewHeight = Number(value);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Maximum preview width')
            .setDesc('Maximum width of the preview window (in pixels)')
            .addText(text => text
                .setPlaceholder('400')
                .setValue(String(this.plugin.settings.maxPreviewWidth))
                .onChange(async (value) => {
                    this.plugin.settings.maxPreviewWidth = Number(value);
                    await this.plugin.saveSettings();
                }));
    }
}

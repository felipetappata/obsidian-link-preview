import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface LinkPreviewSettings {
    mySetting: string;
    previewDelay: number;
    maxPreviewHeight: number;
    enablePreview: boolean;
    maxPreviewWidth: number;
}

const DEFAULT_SETTINGS: LinkPreviewSettings = {
    mySetting: 'default',
    previewDelay: 300,
    maxPreviewHeight: 300,
    enablePreview: true,
    maxPreviewWidth: 400
}

export default class LinkPreviewPlugin extends Plugin {
    settings: LinkPreviewSettings;
    private previewCount = 0;  // Track number of active previews
    
    async onload() {
        await this.loadSettings();

        // Register the hover handler
        this.registerDomEvent(document, 'mouseover', (evt: MouseEvent) => {
            const target = evt.target as HTMLElement;
            const linkEl = target.closest('a');
            
            if (!linkEl || !this.settings.enablePreview) return;
            
            // Only handle external links
            if (linkEl.hasClass('external-link')) {
                const rect = linkEl.getBoundingClientRect();
                this.showPreview(linkEl, rect);
            }
        });

        this.addSettingTab(new LinkPreviewSettingTab(this.app, this));
    }

    private showPreview(linkEl: HTMLElement, rect: DOMRect) {
        const url = linkEl.getAttribute('href');
        if (!url) return;

        // Prevent multiple previews of the same link
        if (linkEl.hasAttribute('data-preview-active')) return;
        linkEl.setAttribute('data-preview-active', 'true');

        // Create hover element
        const hoverEl = document.createElement('div');
        hoverEl.addClass('hover-popup');
        hoverEl.style.position = 'fixed';
        hoverEl.style.left = `${rect.left}px`;
        hoverEl.style.top = `${rect.bottom + 5}px`;
        hoverEl.style.zIndex = '1000';
        hoverEl.style.width = `${this.settings.maxPreviewWidth}px`;  // Set container width
        hoverEl.style.height = `${this.settings.maxPreviewHeight}px`;  // Set container height
        
        // Create loading indicator
        const loadingEl = document.createElement('div');
        loadingEl.addClass('preview-loading');
        loadingEl.innerHTML = 'Loading preview...';
        hoverEl.appendChild(loadingEl);
        
        // Create and add iframe
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.addEventListener('load', () => {
            loadingEl.remove();
            iframe.style.display = 'block';
        });
        iframe.addEventListener('error', () => {
            loadingEl.innerHTML = 'Failed to load preview';
        });
        iframe.src = url;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        
        document.body.appendChild(hoverEl);

        // Create iframe wrapper and add iframe
        const iframeWrapper = document.createElement('div');
        iframeWrapper.addClass('preview-iframe-wrapper');
        iframeWrapper.appendChild(iframe);
        hoverEl.appendChild(iframeWrapper);

        let isLinkHovered = true;
        let isPreviewHovered = false;

        // Remove preview when both link and preview are not hovered
        const cleanup = () => {
            this.previewCount--;
            hoverEl.remove();
            linkEl.removeAttribute('data-preview-active');
            linkEl.removeEventListener('mouseenter', handleLinkEnter);
            linkEl.removeEventListener('mouseleave', handleLinkLeave);
            hoverEl.removeEventListener('mouseenter', handlePreviewEnter);
            hoverEl.removeEventListener('mouseleave', handlePreviewLeave);
        };

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

        this.previewCount++;
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
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
            .setName('Enable Preview')
            .setDesc('Toggle link preview functionality')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enablePreview)
                .onChange(async (value) => {
                    this.plugin.settings.enablePreview = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Preview Delay')
            .setDesc('How long to wait before showing the preview (in milliseconds)')
            .addText(text => text
                .setPlaceholder('300')
                .setValue(String(this.plugin.settings.previewDelay))
                .onChange(async (value) => {
                    this.plugin.settings.previewDelay = Number(value);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Maximum Preview Height')
            .setDesc('Maximum height of the preview window (in pixels)')
            .addText(text => text
                .setPlaceholder('300')
                .setValue(String(this.plugin.settings.maxPreviewHeight))
                .onChange(async (value) => {
                    this.plugin.settings.maxPreviewHeight = Number(value);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Maximum Preview Width')
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

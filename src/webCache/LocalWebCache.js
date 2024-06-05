const fs = require('fs');
const path = require('path');

class LocalWebCache {
    constructor({ client, cachePath } = {}) {
        this.client = client;
        this.cachePath = cachePath || path.resolve(__dirname, '..', '.wwebjs_cache');
    }

    async persist(session) {
        const base64ClientPage = await session.mPage.content();
        const indexHtml = base64ClientPage;
        const versionMatch = indexHtml.match(/manifest-([\d\\.]+)\.json/);
        const version = versionMatch ? versionMatch[1] : 'default-version';

        if (!fs.existsSync(this.cachePath)) {
            fs.mkdirSync(this.cachePath, { recursive: true });
        }

        fs.writeFileSync(path.join(this.cachePath, `index.html`), base64ClientPage);

        const filePath = path.join(this.cachePath, `manifest-${version}.json`);
        const manifest = await session.mPage.evaluate(() => {
            return fetch(`manifest-${version}.json`).then(response => response.json());
        });

        fs.writeFileSync(filePath, JSON.stringify(manifest));
    }

    async restore(session) {
        if (!fs.existsSync(this.cachePath)) {
            return;
        }

        const files = fs.readdirSync(this.cachePath);
        const htmlFiles = files.filter(f => f.endsWith('.html'));

        if (htmlFiles.length === 0) {
            return;
        }

        const indexHtml = fs.readFileSync(path.join(this.cachePath, 'index.html')).toString();
        await session.mPage.setContent(indexHtml);

        const manifestFiles = files.filter(f => f.startsWith('manifest-') && f.endsWith('.json'));

        for (const manifestFile of manifestFiles) {
            const manifest = JSON.parse(fs.readFileSync(path.join(this.cachePath, manifestFile)));
            await session.mPage.evaluateOnNewDocument((manifest, manifestFile) => {
                window.navigator.serviceWorker.register = () => Promise.resolve({
                    scope: '/',
                    scriptURL: manifestFile
                });
                window.fetch = (resource) => {
                    if (resource.endsWith('manifest.json')) {
                        return Promise.resolve({
                            json: () => manifest
                        });
                    } else {
                        return fetch(resource);
                    }
                };
            }, manifest, manifestFile);
        }
    }
}

module.exports = LocalWebCache;

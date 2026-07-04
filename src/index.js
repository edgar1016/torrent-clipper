import {
    clientList,
    loadOptions,
    saveOptions,
    getClient,
    isTorrentUrl,
    isMagnetUrl,
    getTorrentName,
    getMagnetUrlName,
    getURL,
} from './util.js';

var options;

// Lazy options loader — handles service worker restarts in MV3
const getOptions = async () => {
    if (!options) options = await loadOptions();
    return options;
};

// All listeners must be registered at the top level for MV3 service workers

chrome.storage.onChanged.addListener((changes) => {
    if (!options) return;
    Object.keys(changes).forEach((key) => options[key] = changes[key].newValue);

    removeContextMenu();

    if (options.globals.contextMenu && isConfigured())
        createContextMenu();

    if (options.servers.length > 1)
        createServerSelectionContextMenu();

    createDefaultMenu();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    await getOptions();
    handleContextMenuClick(info, tab);
});

chrome.action.onClicked.addListener(async () => {
    await getOptions();
    if (isConfigured()) {
        const url = getURL(options.servers[options.globals.currentServer]);
        chrome.tabs.create({ url });
    } else {
        chrome.runtime.openOptionsPage();
    }
});

// Intercept magnet links routed through torrent-control.invalid
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (!changeInfo.url || !changeInfo.url.startsWith('https://torrent-control.invalid/')) return;
    await getOptions();
    const magnetUri = decodeURIComponent(new URL(changeInfo.url).pathname.substring(1));
    if (options.globals.addAdvanced) {
        addAdvancedDialog(magnetUri);
    } else {
        const clientOptions = options.servers[options.globals.currentServer].clientOptions || {};
        addTorrent(magnetUri, null, { paused: options.globals.addPaused, ...clientOptions });
    }
    chrome.tabs.update(tabId, { url: 'about:blank' });
});

// Intercept torrent file downloads (replaces webRequest blocking in MV3)
chrome.downloads.onCreated.addListener(async (downloadItem) => {
    await getOptions();
    if (!options.globals.catchUrls || !isTorrentUrl(downloadItem.url)) return;
    chrome.downloads.cancel(downloadItem.id);
    chrome.downloads.erase({ id: downloadItem.id });
    const clientOptions = options.servers[options.globals.currentServer].clientOptions || {};
    if (options.globals.addAdvanced) {
        addAdvancedDialog(downloadItem.url, downloadItem.referrer || null);
    } else {
        addTorrent(downloadItem.url, downloadItem.referrer || null, {
            paused: options.globals.addPaused,
            ...clientOptions
        });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'addTorrent') {
        getOptions().then((opts) => {
            const clientOptions = opts.servers[opts.globals.currentServer].clientOptions || {};
            addTorrent(request.url, request.referer, { ...clientOptions, ...request.options });
        });
    }
    return true;
});

// Initialize context menus on startup
getOptions().then((opts) => {
    if (opts.globals.contextMenu && isConfigured())
        createContextMenu();
    if (opts.servers.length > 1)
        createServerSelectionContextMenu();
    createDefaultMenu();
});

const isConfigured = () => options.servers[options.globals.currentServer].hostname !== '';

const addTorrent = (url, referer = null, torrentOptions = {}) => {

    torrentOptions = {
        paused: false,
        path: null,
        label: null,
        ...torrentOptions
    };

    const server = torrentOptions.server !== undefined ? torrentOptions.server : options.globals.currentServer;
    const serverSettings = options.servers[server];

    const connection = getClient(serverSettings);
    const networkErrors = [
        'NetworkError when attempting to fetch resource.',
    ];

    if (isMagnetUrl(url)) {
        connection.logIn()
            .then(() => connection.addTorrentUrl(url, torrentOptions)
                .then(() => {
                    const torrentName = getMagnetUrlName(url);
                    notification(chrome.i18n.getMessage('torrentAddedNotification') + (torrentName ? ' ' + torrentName : ''));
                    connection.logOut();
                })
            ).catch((error) => {
                connection.removeEventListeners();

                if (networkErrors.includes(error.message))
                    notification(chrome.i18n.getMessage('torrentAddError', 'Network error'));
                else
                    notification(error.message);
            });
    } else {
        fetchTorrent(url, referer)
            .then(({torrent, torrentName}) => connection.logIn()
                .then(() => connection.addTorrent(torrent, torrentOptions)
                    .then(() => {
                        notification(chrome.i18n.getMessage('torrentAddedNotification') + (torrentName ? ' ' + torrentName : ''));
                        connection.logOut();
                    })
                )
            ).catch((error) => {
                connection.removeEventListeners();

                if (networkErrors.includes(error.message))
                    notification(chrome.i18n.getMessage('torrentAddError', 'Network error'));
                else
                    notification(error.message);
            });
    }
}

const fetchTorrent = async (url, referer) => {
    const cookies = await getCookies(url);

    const headers = new Headers({
        'Accept': 'application/x-bittorrent,*/*;q=0.9'
    });

    if (cookies && cookies.length) {
        headers.set('Cookie', cookies.map((c) => `${c.name}=${c.value}`).join('; '));
    }

    const response = await fetch(url, { headers });

    if (!response.ok)
        throw new Error(chrome.i18n.getMessage('torrentFetchError', response.status.toString() + ': ' + response.statusText));

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.match(/(application\/x-bittorrent|application\/octet-stream)/gi))
        throw new Error(chrome.i18n.getMessage('torrentParseError', 'Unknown type: ' + contentType));

    const buffer = await response.blob();
    const torrentName = await getTorrentName(buffer);
    return { torrent: buffer, torrentName };
}

const addRssFeed = (url) => {
    const serverSettings = options.servers[options.globals.currentServer];
    const connection = getClient(serverSettings);

    connection.logIn()
        .then(() => connection.addRssFeed(url))
        .then(() => {
            notification(chrome.i18n.getMessage('rssFeedAddedNotification'));
            connection.logOut();
        }).catch((error) => {
            connection.removeEventListeners();
            notification(error.message);
        });
}

const createServerSelectionContextMenu = () => {
    let context = ['action'];

    if (options.globals.contextMenu)
        context.push('page');

    options.servers.forEach((server, id) => {
        chrome.contextMenus.create({
            id: 'current-server-' + id.toString(),
            type: 'radio',
            checked: id === options.globals.currentServer,
            title: server.name,
            contexts: context
        });
    });

    chrome.contextMenus.create({
        type: 'separator',
        contexts: ['action'],
    });
}

const createDefaultMenu = () => {
    chrome.contextMenus.create({
        id: 'catch-urls',
        type: 'checkbox',
        checked: options.globals.catchUrls,
        title: chrome.i18n.getMessage('catchUrlsOption'),
        contexts: ['action']
    });
    chrome.contextMenus.create({
        id: 'add-paused',
        type: 'checkbox',
        checked: options.globals.addPaused,
        title: chrome.i18n.getMessage('addPausedOption'),
        contexts: ['action']
    });
}

const createContextMenu = () => {
    const serverOptions = options.servers[options.globals.currentServer];

    // chrome.contextMenus.create({
    //   id: 'add-torrent',
    //   title: chrome.i18n.getMessage('addTorrentAction'),
    //   contexts: ['link']
    // });

    const client = clientList.find((client) => client.id === serverOptions.application);

    if (options.globals.contextMenu === 1 && client.clientCapabilities) {
        if (client.clientCapabilities.length > 1) {
            chrome.contextMenus.create({
              id: 'add-torrent-advanced',
              title: chrome.i18n.getMessage('addTorrentAction'), //+ ' (' + chrome.i18n.getMessage('advancedModifier') + ')',
              contexts: ['link']
            });
        }

        // if (client.clientCapabilities.includes('paused')) {
        //     chrome.contextMenus.create({
        //       id: 'add-torrent-paused',
        //       title: chrome.i18n.getMessage('addTorrentPausedAction'),
        //       contexts: ['link']
        //     });
        // }

        if (client.clientCapabilities.includes('label') && options.globals.labels.length) {
            chrome.contextMenus.create({
                id: 'add-torrent-label',
                title: chrome.i18n.getMessage('addTorrentLabelAction'),
                contexts: ['link']
            });

            options.globals.labels.forEach((label, i) => {
                chrome.contextMenus.create({
                    id: 'add-torrent-label-' + i,
                    parentId: 'add-torrent-label',
                    title: label,
                    contexts: ['link']
                });
            });
        }

        if (client.clientCapabilities.includes('path') && serverOptions.directories.length) {
            chrome.contextMenus.create({
                id: 'add-torrent-path',
                title: chrome.i18n.getMessage('addTorrentPathAction'),
                contexts: ['link']
            });

            serverOptions.directories.forEach((directory, i) => {
                chrome.contextMenus.create({
                    id: 'add-torrent-path-' + i,
                    parentId: 'add-torrent-path',
                    title: directory,
                    contexts: ['link']
                });
            });
        }

        if (client.clientCapabilities.includes('path') && serverOptions.animeDirectories.length) {
            chrome.contextMenus.create({
                id: 'add-torrent-anime',
                title: chrome.i18n.getMessage('addTorrentAnimePathAction'),
                contexts: ['link']
            });

            serverOptions.animeDirectories.forEach((directory, i) => {
                chrome.contextMenus.create({
                    id: 'add-torrent-anime-' + i,
                    parentId: 'add-torrent-anime',
                    title: directory,
                    contexts: ['link']
                });
            });
        }
    } else if (client.clientCapabilities) {
        if (client.clientCapabilities.includes('label') && options.globals.labels.length) {
            chrome.contextMenus.create({
                contexts: ['link'],
                type: 'separator'
            });

            options.globals.labels.forEach((label, i) => {
                chrome.contextMenus.create({
                    id: 'add-torrent-label-' + i,
                    title: label,
                    contexts: ['link']
                });
            });
        }

        if (client.clientCapabilities.includes('path') && serverOptions.directories.length) {
            chrome.contextMenus.create({
                contexts: ['link'],
                type: 'separator'
            });

            serverOptions.directories.forEach((directory, i) => {
                chrome.contextMenus.create({
                    id: 'add-torrent-path-' + i,
                    title: directory,
                    contexts: ['link']
                });
            });
        }

        if (client.clientCapabilities.includes('path') && serverOptions.directories.length) {
            chrome.contextMenus.create({
                contexts: ['link'],
                type: 'separator'
            });

            serverOptions.animeDirectories.forEach((directory, i) => {
                chrome.contextMenus.create({
                    id: 'add-torrent-anime-' + i,
                    title: directory,
                    contexts: ['link']
                });
            });
        }
    }

    if (client.clientCapabilities && client.clientCapabilities.includes('rss')) {
        // if (options.globals.contextMenu === 1) {
        //     chrome.contextMenus.create({
        //         contexts: ['link'],
        //         type: 'separator'
        //     });
        // }

        // chrome.contextMenus.create({
        //   id: 'add-rss-feed',
        //   title: chrome.i18n.getMessage('addRssFeedAction'),
        //   contexts: options.globals.contextMenu === 1 ? ['selection', 'link'] : ['selection']
        // });
    }
}

const removeContextMenu = () => {
    chrome.contextMenus.removeAll();
}

const handleContextMenuClick = (info, tab) => {
    const currentServer = info.menuItemId.match(/^current-server-(\d+)$/);
    const labelId = info.menuItemId.match(/^add-torrent-label-(\d+)$/);
    const pathId = info.menuItemId.match(/^add-torrent-path-(\d+)$/);
    const pathAnime = info.menuItemId.match(/^add-torrent-anime-(\d+)$/);

    const clientOptions = options.servers[options.globals.currentServer].clientOptions || {};

    if (info.menuItemId === 'catch-urls')
        toggleURLCatching();
    if (info.menuItemId === 'add-paused')
        toggleAddPaused();
    else if (info.menuItemId === 'add-torrent')
        addTorrent(info.linkUrl, info.pageUrl, {
            paused: options.globals.addPaused,
            ...clientOptions
        });
    else if (info.menuItemId === 'add-torrent-paused')
        addTorrent(info.linkUrl, info.pageUrl, {
            paused: true,
            ...clientOptions
        });
    else if (labelId)
        addTorrent(info.linkUrl, info.pageUrl, {
            paused: options.globals.addPaused,
            label: options.globals.labels[~~labelId[1]],
            ...clientOptions
        });
    else if (pathId)
        addTorrent(info.linkUrl, info.pageUrl, {
            paused: options.globals.addPaused,
            path: options.servers[options.globals.currentServer].directories[~~pathId[1]],
            ...clientOptions
        });
    else if (pathAnime)
        addTorrent(info.linkUrl, info.pageUrl, {
            paused: options.globals.addPaused,
            path: options.servers[options.globals.currentServer].animeDirectories[~~pathAnime[1]],
            ...clientOptions
        });
    else if (info.menuItemId === 'add-torrent-advanced')
        addAdvancedDialog(info.linkUrl, !isMagnetUrl(info.linkUrl) ? info.pageUrl : null);
    else if (currentServer)
        setCurrentServer(~~currentServer[1]);
    else if (info.menuItemId === 'add-rss-feed')
        addRssFeed(info.linkUrl || info.selectionText.trim());
}

const addAdvancedDialog = (url, referer = null) => {
    let params = new URLSearchParams();
    params.append('url', url);

    if (referer) {
        params.append('referer', referer);
    }

    const height = 350;
    const width = 500;

    chrome.windows.getAll({ windowTypes: ['normal'] }, (windows) => {
        const win = windows.find((w) => w.focused) || windows[0];
        const top = win ? Math.round(win.top + (win.height / 2) - (height / 2)) : 200;
        const left = win ? Math.round(win.left + (win.width / 2) - (width / 2)) : 400;

        chrome.windows.create({
            url: 'view/add_torrent.html?' + params.toString(),
            type: 'popup',
            top: top,
            left: left,
            height: height,
            width: width
        });
    });
}

export const notification = (message) => {
    if (options && !options.globals.enableNotifications) {
        return;
    }

    chrome.notifications.create({
        type: 'basic',

        iconUrl: chrome.runtime.getURL('icon/default-48.png'),
        title: 'Torrent Clipper',
        message: message
    }, (id) => setTimeout(() => chrome.notifications.clear(id), 3000));
}

const setCurrentServer = (id) => {
    options.globals.currentServer = id;
    saveOptions(options);
}

const toggleURLCatching = () => {
    options.globals.catchUrls = !options.globals.catchUrls;
    saveOptions(options);
}

const toggleAddPaused = () => {
    options.globals.addPaused = !options.globals.addPaused;
    saveOptions(options);
}

const getCookies = async (torrentUrl) => {
    return await new Promise((resolve) => {
        chrome.cookies.getAll({ url: torrentUrl }, (cookies) => resolve(cookies || []));
    });
}

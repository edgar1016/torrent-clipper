import {
    clientList,
    loadOptions,
} from '../util.js';

var options;

const saveDownloadLocation = (downloadLocation) => {
    chrome.storage.sync.set({ 'lastDownloadLocation': downloadLocation }, () => {
        console.log('Download location saved:', downloadLocation);
    });
};

const restoreOptions = () => {
    const params = new URLSearchParams(window.location.search);
    document.querySelector('#url').value = params.get('url');

    document.querySelectorAll('[data-i18n]').forEach((element) => {
        element.textContent = chrome.i18n.getMessage(element.getAttribute('data-i18n'));
    });

    loadOptions().then((loadedOptions) => {
        options = loadedOptions;

        document.querySelector('#addpaused').checked = options.globals.addPaused;

        options.servers.forEach((server, i) => {
            let element = document.createElement('option');
            element.setAttribute('value', i.toString());
            element.textContent = server.name;
            document.querySelector('#server').appendChild(element);
        })

        options.globals.labels.forEach((label) => {
            let element = document.createElement('option');
            element.setAttribute('value', label);
            element.textContent = label;
            document.querySelector('#labels').appendChild(element);
        });

        selectServer(options.globals.currentServer);
    });

    // Load last used download location from storage
    console.log('Restoring options');
    chrome.storage.sync.get(['lastDownloadLocation', 'lastDownloadSuffix'], (result) => {
        const lastDownloadLocation = result.lastDownloadLocation;
        const lastDownloadSuffix = result.lastDownloadSuffix;

        if (lastDownloadLocation) {
            document.querySelector('#downloadLocation').value = lastDownloadLocation;
        }

        if (lastDownloadSuffix !== undefined) {
            document.querySelector('#downloadSuffix').value = lastDownloadSuffix;
        } else {
            document.querySelector('#downloadSuffix').value = ''; // clear first run
        }
    });
}

const selectServer = (serverId) => {
    document.querySelector('#server').value = serverId;

    const serverOptions = options.servers[serverId];
    const client = clientList.find((client) => client.id === serverOptions.application);

    const downloadLocationSelect = document.querySelector('#downloadLocationSelector');
    const input = document.querySelector('#downloadLocation');
    const listSelector = document.querySelector('#listSelector')

    document.querySelectorAll('#downloadLocation > option').forEach((element, i) => {
        if (i > 0)
            element.remove();
    });

    if (client.clientCapabilities && client.clientCapabilities.includes('path')) {
        serverOptions.directories.forEach((directory) => {
            let element = document.createElement('option');
            element.setAttribute('value', directory);
            element.textContent = directory;
            downloadLocationSelect.appendChild(element);
        });

        downloadLocationSelect.disabled = false;
    } else {
        downloadLocationSelect.value = '';
        downloadLocationSelect.disabled = true;
    }

    listSelector.addEventListener('change', (event) => {
        var selectedValue = event.target.value;

        while (downloadLocationSelect.options.length > 0) {
            downloadLocationSelect.options[0].remove();
        }
        
        if(selectedValue == "Storage"){
            if (client.clientCapabilities && client.clientCapabilities.includes('path')) {
                serverOptions.directories.forEach((directory) => {
                    let element = document.createElement('option');
                    element.setAttribute('value', directory);
                    element.textContent = directory;
                    downloadLocationSelect.appendChild(element);
                });
        
                downloadLocationSelect.disabled = false;
            } else {
                downloadLocationSelect.value = '';
                downloadLocationSelect.disabled = true;
            }
        }
        
        if(selectedValue == "Anime"){
            if (client.clientCapabilities && client.clientCapabilities.includes('path')) {
                serverOptions.animeDirectories.forEach((directory) => {
                    let element = document.createElement('option');
                    element.setAttribute('value', directory);
                    element.textContent = directory;
                    downloadLocationSelect.appendChild(element);
                });
        
                downloadLocationSelect.disabled = false;
            } else {
                downloadLocationSelect.value = '';
                downloadLocationSelect.disabled = true;
            }
        }
    });

    downloadLocationSelect.addEventListener('change', (event) => {
        const selectedValue = event.target.value;
        input.value = selectedValue;
      });

    const labelSelect = document.querySelector('#labels');

    if (client.clientCapabilities && client.clientCapabilities.includes('label')) {
        //labelSelect.disabled = false;
    } else {
        labelSelect.value = '';
        labelSelect.disabled = true;
    }

    if (!client.clientCapabilities || !client.clientCapabilities.includes('paused'))
        document.querySelector('#addpaused').disabled = true;
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.querySelector('#server').addEventListener('change', (e) => selectServer(~~e.currentTarget.value));

const mappings = [
    { source: 'X', destination: 'D' }, //Storage
    { source: 'S', destination: 'F' }, //JAV2
    { source: 'P', destination: 'G' }, //Anime
    { source: 'Q', destination: 'I' }, //Anime2
    { source: 'R', destination: 'E' }, //JAV1
    { source: 'Z', destination: 'H' }, //West
    { source: 'W', destination: 'J' }, //Software
    { source: 'T', destination: 'Y' }, //JAV3
    { source: 'U', destination: 'X' }, //JAV4
    { source: 'Y', destination: 'W' }  //VR
];

document.querySelector('#add-torrent').addEventListener('click', (e) => {
    e.preventDefault();

    const params = new URLSearchParams(window.location.search);

    const basePath = document.querySelector('#downloadLocation').value;
    const suffix = document.querySelector('#downloadSuffix').value.trim();
    const addPaused = document.querySelector('#addpaused').checked;
    const server = document.querySelector('#server').value;

    // ✅ Save original base and suffix
    saveDownloadLocation(basePath);
    chrome.storage.sync.set({ 'lastDownloadSuffix': suffix }, () => {
        console.log('Suffix saved:', suffix);
    });

    // ✅ Build combined path (don't modify input fields!)
    let fullPath = basePath;

    const illegalChars = /[<>:"/\\|?*]/;
    const reservedNames = [
        'CON', 'PRN', 'AUX', 'NUL',
        'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
        'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
    ];

    if (suffix) {
        if (illegalChars.test(suffix)) {
            alert("The subfolder name contains invalid characters (<>:\"/\\|?*)");
            return;
        }

        const baseName = suffix.split(/[\\/]/).pop().toUpperCase();
        if (reservedNames.includes(baseName)) {
            alert(`"${baseName}" is a reserved Windows name and cannot be used.`);
            return;
        }

        // Add suffix to path with correct slash
        if (!fullPath.endsWith('\\') && !fullPath.endsWith('/')) {
            fullPath += fullPath.includes('\\') ? '\\' : '/';
        }
        fullPath += suffix;
    }

    // ✅ Apply NAS mapping LAST
    for (const { source, destination } of mappings) {
        if (fullPath.startsWith(`${source}:\\`)) {
            fullPath = `${destination}:\\${fullPath.substring(3)}`;
            break;
        }
    }

    console.log('Download location changed:', fullPath);

    let options = {
        paused: addPaused,
        path: fullPath
    };

    if (server)
        options.server = ~~server;

    chrome.runtime.sendMessage({
        type: 'addTorrent',
        url: params.get('url'),
        referer: params.get('referer'),
        options: options
    });

    window.close();
});

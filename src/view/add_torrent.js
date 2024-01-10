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
    chrome.storage.sync.get(['lastDownloadLocation'], (result) => {
        console.log('Storage result:', result);
        const lastDownloadLocation = result.lastDownloadLocation;
        if (lastDownloadLocation) {
            console.log('Setting download location from storage:', lastDownloadLocation);
            document.querySelector('#downloadLocation').value = lastDownloadLocation;
        } else {
            console.log('No stored download location found.');
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
document.querySelector('#add-torrent').addEventListener('click', (e) => {
    e.preventDefault();

    const params = new URLSearchParams(window.location.search);
    // const label = document.querySelector('#labels').value;
    const path = document.querySelector('#downloadLocation').value;
    const addPaused = document.querySelector('#addpaused').checked;
    const server = document.querySelector('#server').value;

    saveDownloadLocation(path);
    console.log('Download location changed:', path);

    let options = {
        paused: addPaused
    };

    // if (label.length)
    //     options.label = label;

    if (path.length)
        options.path = path;

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

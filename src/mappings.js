export const DEFAULT_MAPPINGS = [
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

export function getMappings() {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
            resolve(DEFAULT_MAPPINGS);
            return;
        }

        chrome.storage.sync.get(['nasMappings'], (result) => {
            if (result && Array.isArray(result.nasMappings))
                resolve(result.nasMappings);
            else
                resolve(DEFAULT_MAPPINGS);
        });
    });
}

export function saveMappings(mappings) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync)
        return;

    chrome.storage.sync.set({ nasMappings: mappings });
}

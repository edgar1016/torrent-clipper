import fetchMock from 'fetch-mock';

import {getTestTorrent} from '../helpers.js';
import {base64Encode} from '../../src/base64.js';
import FloodApi from '../../src/lib/flood.js';

describe('FloodApi', () => {
    let instance;

    before(() => {
        instance = new FloodApi({
            username: 'testuser',
            password: 'testpassw0rd',
            hostname: 'https://example.com:1234/',
        });
    });

    afterEach(() => {
        chrome.flush();
        fetchMock.reset();
    });

    it('Login', async () => {
        fetchMock.postOnce('https://example.com:1234/api/auth/authenticate', {
            status: 200,
            body: {
                success: true,
                username: 'testuser',
                level: 10,
            },
        });

        await instance.logIn();

        expect(chrome.webRequest.onHeadersReceived.addListener.calledOnce).to.equal(true);
        expect(chrome.webRequest.onBeforeSendHeaders.addListener.calledOnce).to.equal(true);

        expect(fetchMock.calls().length).to.equal(1);
        expect(fetchMock.lastOptions().method).to.equal('POST');
        expect(JSON.parse(fetchMock.lastOptions().body)).to.deep.equal({
            username: 'testuser',
            password: 'testpassw0rd',
        });
    });

    it('Login fail', async () => {
        fetchMock.postOnce('https://example.com:1234/api/auth/authenticate', {
            status: 401,
            body: {
                message: 'Failed login.',
            },
        });

        try {
            await instance.logIn();
        } catch (e) {
            expect(e).to.be.a('Error');
        }

        expect(chrome.webRequest.onHeadersReceived.addListener.calledOnce).to.equal(true);
        expect(chrome.webRequest.onBeforeSendHeaders.addListener.calledOnce).to.equal(true);

        expect(fetchMock.calls().length).to.equal(1);
        expect(fetchMock.lastOptions().method).to.equal('POST');
        expect(JSON.parse(fetchMock.lastOptions().body)).to.deep.equal({
            username: 'testuser',
            password: 'testpassw0rd',
        });
    });

    it('Logout', async () => {
        await instance.logOut();

        expect(chrome.webRequest.onHeadersReceived.removeListener.calledOnce).to.equal(true);
        expect(chrome.webRequest.onBeforeSendHeaders.removeListener.calledOnce).to.equal(true);
    });

    it('Add torrent', async () => {
        fetchMock.postOnce('https://example.com:1234/api/torrents/add-files', {
            status: 200,
        });

        const torrentFile = await getTestTorrent();
        const base64Torrent = await base64Encode(torrentFile);

        await instance.addTorrent(torrentFile);

        expect(fetchMock.calls().length).to.equal(1);
        expect(fetchMock.lastOptions().method).to.equal('POST');
        expect(JSON.parse(fetchMock.lastOptions().body)).to.deep.equal({
            files: [
                base64Torrent,
            ],
            destination: '',
            tags: [],
            start: true
        });
    });

    it('Add torrent with options', async () => {
        fetchMock.postOnce('https://example.com:1234/api/torrents/add-files', 200);

        const torrentFile = await getTestTorrent();
        const base64Torrent = await base64Encode(torrentFile);

        await instance.addTorrent(torrentFile, {
            paused: true,
            path: '/mnt/storage',
            label: 'Test',
        });

        expect(fetchMock.calls().length).to.equal(1);
        expect(fetchMock.lastOptions().method).to.equal('POST');
        expect(JSON.parse(fetchMock.lastOptions().body)).to.deep.equal({
            files: [
                base64Torrent,
            ],
            destination: '/mnt/storage',
            tags: ['Test'],
            start: false
        });
    });

    it('Add torrent url', async () => {
        fetchMock.postOnce('https://example.com:1234/api/torrents/add-urls', 200);

        await instance.addTorrentUrl('https://example.com/test.torrent');

        expect(fetchMock.calls().length).to.equal(1);
        expect(fetchMock.lastOptions().method).to.equal('POST');
        expect(JSON.parse(fetchMock.lastOptions().body)).to.deep.equal({
            urls: [
                'https://example.com/test.torrent',
            ],
            destination: '',
            tags: [],
            start: true
        });
    });

    it('Add torrent url fail', async () => {
        fetchMock.postOnce('https://example.com:1234/api/torrents/add-urls', 400);

        try {
            await instance.addTorrentUrl('https://example.com/not_a_torrent_file', {});
        } catch (e) {
            expect(e).to.be.a('Error');
        }

        expect(fetchMock.calls().length).to.equal(1);
        expect(fetchMock.lastOptions().method).to.equal('POST');
    });

    it('Add torrent url with options', async () => {
        fetchMock.postOnce('https://example.com:1234/api/torrents/add-urls', 200);

        await instance.addTorrentUrl('https://example.com/test.torrent', {
            paused: true,
            path: '/mnt/storage',
            label: 'Test',
        });

        expect(fetchMock.calls().length).to.equal(1);
        expect(fetchMock.lastOptions().method).to.equal('POST');
        expect(JSON.parse(fetchMock.lastOptions().body)).to.deep.equal({
            urls: [
                'https://example.com/test.torrent',
            ],
            destination: '/mnt/storage',
            tags: ['Test'],
            start: false
        });
    });
});

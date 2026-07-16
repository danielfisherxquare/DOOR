import assert from 'node:assert/strict';
import test from 'node:test';
import { previewPlanFor } from '../../src/modules/assets/asset-preview.service.js';

test('selects isolated converters for vector, layered, raster, and raw image formats', () => {
    assert.deepEqual(previewPlanFor({ fileName: 'layout.ai', mimeType: '' }), {
        converter: 'ghostscript', sourceExtension: 'ai', outputExtension: 'webp', mimeType: 'image/webp',
    });
    assert.equal(previewPlanFor({ fileName: 'mark.eps', mimeType: 'application/postscript' })?.converter, 'ghostscript');
    assert.deepEqual(previewPlanFor({ fileName: 'visual.psd', mimeType: 'image/vnd.adobe.photoshop' }), {
        converter: 'imagemagick', sourceExtension: 'psd', outputExtension: 'webp', mimeType: 'image/webp',
    });
    assert.equal(previewPlanFor({ fileName: 'photo.heic', mimeType: 'image/heic' })?.converter, 'imagemagick');
    assert.equal(previewPlanFor({ fileName: 'texture.exr', mimeType: '' })?.converter, 'imagemagick');
    assert.equal(previewPlanFor({ fileName: 'camera.nef', mimeType: '' })?.converter, 'libraw');
});

test('does not send browser-native or unknown formats to external converters', () => {
    assert.equal(previewPlanFor({ fileName: 'poster.svg', mimeType: 'image/svg+xml' }), null);
    assert.equal(previewPlanFor({ fileName: 'clip.mp4', mimeType: 'video/mp4' }), null);
    assert.equal(previewPlanFor({ fileName: 'proposal.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), null);
    assert.equal(previewPlanFor({ fileName: 'archive.zip', mimeType: 'application/zip' }), null);
});

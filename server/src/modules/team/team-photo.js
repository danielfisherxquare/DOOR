import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TEAM_MEMBER_PHOTO_DIR = path.resolve(__dirname, '../../../uploads/team-members');
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const IMAGE_RATIO = 2 / 3;
const IMAGE_RATIO_TOLERANCE = 0.015;

const MIME_EXTENSION_MAP = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};

async function ensurePhotoDir() {
    await fs.mkdir(TEAM_MEMBER_PHOTO_DIR, { recursive: true });
}

function getPngDimensions(buffer) {
    if (buffer.length < 24) throw new Error('Invalid PNG file');
    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
    };
}

function getJpegDimensions(buffer) {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('Invalid JPEG file');
    let offset = 2;
    while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) {
            offset += 1;
            continue;
        }
        const marker = buffer[offset + 1];
        if (marker === 0xd8 || marker === 0xd9) {
            offset += 2;
            continue;
        }
        const blockLength = buffer.readUInt16BE(offset + 2);
        const isSofMarker = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
        if (isSofMarker) {
            return {
                height: buffer.readUInt16BE(offset + 5),
                width: buffer.readUInt16BE(offset + 7),
            };
        }
        offset += 2 + blockLength;
    }
    throw new Error('Could not read JPEG dimensions');
}

function getWebpDimensions(buffer) {
    if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
        throw new Error('Invalid WEBP file');
    }
    const chunkType = buffer.toString('ascii', 12, 16);
    if (chunkType === 'VP8 ') {
        return {
            width: buffer.readUInt16LE(26) & 0x3fff,
            height: buffer.readUInt16LE(28) & 0x3fff,
        };
    }
    if (chunkType === 'VP8L') {
        const bits = buffer.readUInt32LE(21);
        return {
            width: (bits & 0x3fff) + 1,
            height: ((bits >> 14) & 0x3fff) + 1,
        };
    }
    if (chunkType === 'VP8X') {
        return {
            width: 1 + buffer.readUIntLE(24, 3),
            height: 1 + buffer.readUIntLE(27, 3),
        };
    }
    throw new Error('Unsupported WEBP file');
}

async function getImageDimensions(filePath, mimeType) {
    const buffer = await fs.readFile(filePath);
    if (mimeType === 'image/png') return getPngDimensions(buffer);
    if (mimeType === 'image/jpeg') return getJpegDimensions(buffer);
    if (mimeType === 'image/webp') return getWebpDimensions(buffer);
    throw new Error('Unsupported image format');
}

export async function validateTeamMemberPhoto(file) {
    if (!file) throw new Error('No photo uploaded');
    const { width, height } = await getImageDimensions(file.path, file.mimetype);
    if (!width || !height) throw new Error('Could not read image size');
    if (height <= width) throw new Error('Photo must be portrait');
    const ratio = width / height;
    if (Math.abs(ratio - IMAGE_RATIO) > IMAGE_RATIO_TOLERANCE) {
        throw new Error('Photo must use a 2:3 portrait ratio');
    }
    return { width, height };
}

export async function deleteTeamMemberPhotoFile(photoPath) {
    if (!photoPath) return;
    try {
        await fs.unlink(path.join(TEAM_MEMBER_PHOTO_DIR, photoPath));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
}

export function getTeamMemberPhotoAbsolutePath(photoPath) {
    return photoPath ? path.join(TEAM_MEMBER_PHOTO_DIR, photoPath) : null;
}

export const uploadTeamMemberPhotoMiddleware = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            ensurePhotoDir().then(() => cb(null, TEAM_MEMBER_PHOTO_DIR)).catch((error) => cb(error));
        },
        filename: (_req, file, cb) => {
            const extension = MIME_EXTENSION_MAP[file.mimetype];
            if (!extension) {
                cb(new Error('Unsupported photo format'));
                return;
            }
            cb(null, `${uuidv4()}.${extension}`);
        },
    }),
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
        if (!MIME_EXTENSION_MAP[file.mimetype]) {
            cb(new Error('Only JPG, PNG or WEBP photos are supported'));
            return;
        }
        cb(null, true);
    },
});

import { createAssetClient } from '@arcspro/asset-client'
import request, { requestRaw } from '../utils/request.js'

export const assetClient = createAssetClient({ request, rawRequest: requestRaw })

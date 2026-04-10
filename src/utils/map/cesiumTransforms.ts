import * as Cesium from 'cesium';

type PlacementLike = {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
};

const scratchTransform = new Cesium.Matrix4();
const scratchRotation = new Cesium.Matrix3();

export function createCartesianPosition(placement: Pick<PlacementLike, 'longitude' | 'latitude' | 'height'>): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(
    placement.longitude,
    placement.latitude,
    placement.height,
  );
}

export function createFixedFrameOrientation(
  position: Cesium.Cartesian3,
  placement: Pick<PlacementLike, 'heading' | 'pitch' | 'roll'>,
): Cesium.Quaternion {
  const heading = Cesium.Math.toRadians(placement.heading);
  const pitch = Cesium.Math.toRadians(placement.pitch);
  const roll = Cesium.Math.toRadians(placement.roll);
  const hpr = new Cesium.HeadingPitchRoll(heading, pitch, roll);

  Cesium.Transforms.headingPitchRollToFixedFrame(
    position,
    hpr,
    Cesium.Ellipsoid.WGS84,
    Cesium.Transforms.eastNorthUpToFixedFrame,
    scratchTransform,
  );

  Cesium.Matrix4.getMatrix3(scratchTransform, scratchRotation);
  return Cesium.Quaternion.fromRotationMatrix(scratchRotation);
}

export function createPlacementPose(placement: PlacementLike): {
  position: Cesium.Cartesian3;
  orientation: Cesium.Quaternion;
} {
  const position = createCartesianPosition(placement);
  return {
    position,
    orientation: createFixedFrameOrientation(position, placement),
  };
}

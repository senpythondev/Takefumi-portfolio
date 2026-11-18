/**
 * The only three.js classes the scenes may use as JSX elements.
 *
 * Why not <Canvas>: R3F's <Canvas> calls `extend(THREE)`, registering every three.js class,
 * which defeats tree-shaking (measured: 3D base 254.2 KB → 194.7 KB gzip with explicit
 * registration; docs/WORKLOG.md, PM_REVIEW_03 §4). Add a class here when a scene needs it.
 */
import { extend } from '@react-three/fiber';
import {
  AmbientLight,
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
} from 'three';

extend({
  AmbientLight,
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera, // used internally by drei's <OrthographicCamera> (3D core)
  PerspectiveCamera, // used internally by drei's <PerspectiveCamera>
  PlaneGeometry,
});

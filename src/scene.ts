import { vec3 } from 'gl-matrix';
import { Plane } from './objects';

export const lightDataSize = 3 * 4; // vec3 size in bytes

export class Scene {

    public pointLightPosition = vec3.fromValues(0, 0, 0);

    private objects: Plane[] = [];

    public add (object: Plane) {
        this.objects.push(object);
    }

    public getObjects () : Plane[] {
        return this.objects;
    }

    public getPointLightPosition(): Float32Array {
        return this.pointLightPosition as Float32Array;
    }
}
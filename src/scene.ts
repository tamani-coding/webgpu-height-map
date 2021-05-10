import { Plane } from './objects';

export class Scene {

    private objects: Plane[] = [];

    public add (object: Plane) {
        this.objects.push(object);
    }

    public getObjects () : Plane[] {
        return this.objects;
    }
}
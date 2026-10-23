import './style.css';
import { buildStadium } from './render/stadium';
import { createView } from './render/view';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('#stage canvas missing');

const view = createView(canvas);
buildStadium(view.scene);
view.start();

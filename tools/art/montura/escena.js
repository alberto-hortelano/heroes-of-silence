/**
 * La escena del jinete montado, en el navegador. La conduce `tools/art/montura.ts`.
 *
 * Misma cámara y misma luz que sprite-forge (`src/page.mjs`): ortográfica con el
 * picado que se le pase, UNA luz direccional desde arriba a la izquierda y nada
 * de ambiente, fondo transparente. Todo con el mismo material gris azulado del
 * maniquí, porque esto es una referencia de pose y no un render final.
 *
 * El caballo es el de Quaternius (glTF, CC0) con sus clips; el jinete es el Y Bot
 * de Mixamo con `sitting_idle` como postura base, colocado cada fotograma sobre
 * el hueso `Torso` del caballo (sube y baja con él) y con piernas y brazos
 * llevados con IK de dos huesos —la de `tools/art/ybot-a-distancia.ts`— a los
 * estribos, las riendas y la lanza. La lanza y el escudo son primitivas: son lo
 * que más ayuda a que el modelo de imagen no invente el arma en cada fotograma.
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** La luz de sprite-forge (`page.mjs`, LIGHT_DIR): el Euler YXZ (-50, 30, 0) de Godot. */
const LIGHT_DIR = new THREE.Vector3(-0.3213938, -0.76604444, -0.5566704);
const COLOR = 0x5fb3c8; // el azul del maniquí de las demás hojas

const estado = {};

function materialManiqui() {
  return new THREE.MeshStandardMaterial({ color: COLOR, roughness: 0.85, metalness: 0 });
}

function vestir(objeto) {
  objeto.traverse((o) => {
    if (o.isMesh) {
      o.material = materialManiqui();
      o.frustumCulled = false;
    }
  });
}

/** El clip del glTF por nombre; si no está, se dice cuáles hay. */
function clipDe(animaciones, nombre) {
  const c = animaciones.find((a) => a.name === nombre);
  if (!c) throw new Error(`el caballo no tiene el clip "${nombre}"; tiene: ${animaciones.map((a) => a.name).join(', ')}`);
  return c;
}

function hueso(raiz, nombre) {
  const h = raiz.getObjectByName(nombre);
  if (!h) throw new Error(`no hay hueso "${nombre}"`);
  return h;
}

/** Rota `bone` para que su hijo `child` apunte a `destino` (mundo). De ybot-a-distancia.ts. */
function girarHacia(bone, child, destino) {
  bone.updateWorldMatrix(true, true);
  const origen = bone.getWorldPosition(new THREE.Vector3());
  const dir = child.getWorldPosition(new THREE.Vector3()).sub(origen).normalize();
  const quiero = destino.clone().sub(origen).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(dir, quiero);
  const qPadre = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  const qMundo = bone.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(qPadre.clone().invert().multiply(delta.multiply(qMundo)));
  bone.updateWorldMatrix(true, true);
}

/** IK analítica de dos huesos: lleva el extremo a `objetivo`, doblando hacia `pista`. */
function cadena(a, b, c, objetivo, pista) {
  const inicio = a.getWorldPosition(new THREE.Vector3());
  const medio = b.getWorldPosition(new THREE.Vector3());
  const fin = c.getWorldPosition(new THREE.Vector3());
  const la = inicio.distanceTo(medio);
  const lb = medio.distanceTo(fin);
  const linea = objetivo.clone().sub(inicio);
  const d = Math.min(la + lb - 0.001, Math.max(0.01, linea.length()));
  linea.normalize();
  const doblez = pista.clone().sub(linea.clone().multiplyScalar(pista.dot(linea))).normalize();
  const a1 = (la * la - lb * lb + d * d) / (2 * d);
  const codo = inicio
    .clone()
    .addScaledVector(linea, a1)
    .addScaledVector(doblez, Math.sqrt(Math.max(0, la * la - a1 * a1)));
  girarHacia(a, b, codo);
  girarHacia(b, c, inicio.clone().addScaledVector(linea, d));
}

/**
 * Monta la escena. `o`: { caballo, ybot, sentado, celda, picado, ortho, mira, guinada,
 * altoCaballo, ajuste: {...} } — URLs y números, todo lo decide quien conduce.
 */
window.__montar = async function (o) {
  try {
    return await montar(o);
  } catch (e) {
    // La pila viaja en el mensaje: `page.evaluate` solo devuelve el mensaje.
    throw new Error(`${e.message}\n${e.stack}`);
  }
};

async function montar(o) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(o.celda, o.celda);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const luz = new THREE.DirectionalLight(0xffffff, 4.65);
  // La luz del contrato si la pasan (`luzEnElMundo`); si no, la antigua de sprite-forge.
  const direccionLuz = o.luz ? new THREE.Vector3(o.luz.x, o.luz.y, o.luz.z) : LIGHT_DIR;
  luz.position.copy(direccionLuz.clone().multiplyScalar(-10));
  luz.target.position.set(0, 0, 0);
  scene.add(luz, luz.target);

  // La cámara de sprite-forge: mirando a `mira`, con el picado pedido.
  const pitch = THREE.MathUtils.degToRad(o.picado);
  const adelante = new THREE.Vector3(0, Math.sin(pitch), -Math.cos(pitch));
  const mira = new THREE.Vector3(0, o.mira, 0);
  const media = o.ortho / 2;
  const camara = new THREE.OrthographicCamera(-media, media, media, -media, 0.1, 100);
  camara.position.copy(mira.clone().addScaledVector(adelante, -10));
  camara.lookAt(mira);

  // El pivote se gira AL FINAL: hacia dónde mira el caballo se mide sin girar.
  const pivote = new THREE.Group();
  scene.add(pivote);

  // El caballo: escalado a la altura pedida y girado para mirar a +Z, como el Y Bot.
  const gltf = await new GLTFLoader().loadAsync(o.caballo);
  const caballo = gltf.scene;
  vestir(caballo);
  const envoltorioCaballo = new THREE.Group();
  envoltorioCaballo.add(caballo);
  pivote.add(envoltorioCaballo);
  const mixCaballo = new THREE.AnimationMixer(caballo);
  mixCaballo.clipAction(clipDe(gltf.animations, 'Idle')).play();
  mixCaballo.setTime(0);
  caballo.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(caballo);
  const escala = o.altoCaballo / (caja.max.y - caja.min.y);
  caballo.scale.multiplyScalar(escala);
  caballo.updateMatrixWorld(true);
  // Hacia dónde mira: del cuerpo a la cabeza, en horizontal.
  const cuerpo = hueso(caballo, 'Body').getWorldPosition(new THREE.Vector3());
  const cabeza = hueso(caballo, 'Head').getWorldPosition(new THREE.Vector3());
  const hacia = cabeza.sub(cuerpo).setY(0).normalize();
  envoltorioCaballo.rotation.y = Math.atan2(hacia.x, hacia.z) * -1;
  envoltorioCaballo.updateMatrixWorld(true);
  const caja2 = new THREE.Box3().setFromObject(caballo);
  envoltorioCaballo.position.y -= caja2.min.y; // los cascos en el suelo
  pivote.rotation.y = o.guinada;
  pivote.updateMatrixWorld(true);
  // Comprobación: el caballo tiene que acabar mirando hacia la guiñada pedida.
  const c2 = hueso(caballo, 'Body').getWorldPosition(new THREE.Vector3());
  const h2 = hueso(caballo, 'Head').getWorldPosition(new THREE.Vector3());
  const mira2 = h2.sub(c2).setY(0).normalize();
  const quiero = new THREE.Vector3(Math.sin(o.guinada), 0, Math.cos(o.guinada));
  if (mira2.dot(quiero) < 0.95) {
    throw new Error(`el caballo mira a (${mira2.toArray().map((x) => x.toFixed(2))}) y debía mirar a (${quiero.toArray().map((x) => x.toFixed(2))})`);
  }

  // La orientación del torso del caballo en reposo, sin la guiñada: contra ella
  // se mide cuánto se inclina en cada fotograma.
  const torsoReposo = hueso(caballo, 'Torso')
    .getWorldQuaternion(new THREE.Quaternion())
    .premultiply(pivote.quaternion.clone().invert());

  // El jinete: Y Bot sentado.
  const fbx = new FBXLoader();
  const ybot = await fbx.loadAsync(o.ybot);
  vestir(ybot);
  const jinete = new THREE.Group();
  jinete.scale.setScalar(0.01); // Mixamo viene en centímetros
  jinete.add(ybot);
  scene.add(jinete); // en el mundo: se coloca cada fotograma sobre la silla
  // El prefijo de las pistas al del esqueleto que las recibe, como `remapTrackPrefix`
  // de sprite-forge: se mira el hueso que acaba en "Hips" de cada lado.
  const huesos = [];
  ybot.traverse((x) => x.isBone && huesos.push(x.name));
  const prefijoHueso = huesos.find((n) => n.endsWith('Hips')).replace(/Hips$/, '');
  const adaptar = (clip, nombre) => {
    const pistaHips = clip.tracks.find((t) => t.name.split('.')[0].endsWith('Hips'));
    if (!pistaHips) throw new Error(`${nombre} no tiene pista de Hips`);
    const prefijoPista = pistaHips.name.split('.')[0].replace(/Hips$/, '');
    for (const pista of clip.tracks) {
      const punto = pista.name.lastIndexOf('.');
      const nodo = pista.name.slice(0, punto);
      if (nodo.startsWith(prefijoPista)) {
        pista.name = prefijoHueso + nodo.slice(prefijoPista.length) + pista.name.slice(punto);
      }
    }
    return clip;
  };
  const sentado = adaptar((await fbx.loadAsync(o.sentado)).animations[0], 'sitting_idle');
  // El ataque montado: de cintura para abajo sigue sentado; de cintura para arriba,
  // el tajo de espada. Se arma un clip nuevo con las pistas de cada uno, en vez de
  // mezclar dos acciones (que promediarían el torso entre sentado y atacando).
  const tajo = adaptar((await fbx.loadAsync(o.ataque)).animations[0], 'el ataque');
  const ARRIBA = /(Spine|Neck|Head|Shoulder|Arm|ForeArm|Hand)/;
  const nodoDe = (pista) => pista.name.slice(0, pista.name.lastIndexOf('.'));
  const ataqueMontado = new THREE.AnimationClip('ataque-montado', tajo.duration, [
    ...sentado.tracks.filter((p) => !ARRIBA.test(nodoDe(p))),
    ...tajo.tracks.filter((p) => ARRIBA.test(nodoDe(p))),
  ]);
  const mixJinete = new THREE.AnimationMixer(ybot);
  const accionSentado = mixJinete.clipAction(sentado);
  const accionAtaque = mixJinete.clipAction(ataqueMontado);
  accionSentado.play();

  // Atrezo: lanza (asta + punta) y escudo de cometa.
  const lanza = new THREE.Group();
  const asta = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, o.ajuste.lanza, 8), materialManiqui());
  asta.position.y = o.ajuste.lanza / 2 - 0.6; // la mano agarra a 0,6 m del regatón
  const punta = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 8), materialManiqui());
  punta.position.y = o.ajuste.lanza - 0.6 + 0.14;
  lanza.add(asta, punta);
  scene.add(lanza);
  // Un escudo de cometa: un rombo alargado y plano, más ancho arriba.
  const forma = new THREE.Shape();
  forma.moveTo(-0.22, 0.25);
  forma.lineTo(0.22, 0.25);
  forma.lineTo(0.18, -0.05);
  forma.lineTo(0, -0.4);
  forma.lineTo(-0.18, -0.05);
  forma.closePath();
  const escudo = new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: 0.04, bevelEnabled: false }), materialManiqui());
  scene.add(escudo);

  // La espada, de la mano: hoja + guarda, colgada del hueso para que siga el tajo.
  const espada = new THREE.Group();
  const hoja = new THREE.Mesh(new THREE.BoxGeometry(0.07, o.ajuste.espada, 0.025), materialManiqui());
  hoja.position.y = o.ajuste.espada / 2 + 0.08;
  const guarda = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.04), materialManiqui());
  guarda.position.y = 0.08;
  espada.add(hoja, guarda);
  espada.scale.setScalar(100); // el hueso vive en centímetros (el Y Bot va escalado a 0,01)
  espada.rotation.set(...o.ajuste.espadaGiro);
  hueso(ybot, `${prefijoHueso}RightHand`).add(espada);

  Object.assign(estado, {
    espada, accionSentado, accionAtaque, duracionAtaque: tajo.duration,
    renderer, scene, camara, pivote, caballo, jinete, ybot, mixCaballo, mixJinete, torsoReposo,
    animaciones: gltf.animations, ajuste: o.ajuste, prefijo: prefijoHueso, lanza, escudo,
    sentadoT: o.ajuste.sentadoT ?? 0,
  });
  return {
    duracionAtaque: tajo.duration,
    clips: gltf.animations.map((a) => `${a.name} (${a.duration.toFixed(2)} s)`),
    escala,
    caja: [caja2.min.toArray(), caja2.max.toArray()],
  };
}

const v = (x, y, z) => new THREE.Vector3(x, y, z);

/** Coloca caballo, jinete, IK y atrezo para `clip` en el instante `t` (s), y pinta. */
window.__fotograma = function fotograma(clip, t, postura, tJinete) {
  const s = estado;
  const aj = s.ajuste;
  const atacando = postura === 'ataque';
  s.mixCaballo.stopAllAction();
  s.mixCaballo.clipAction(clipDe(s.animaciones, clip)).play();
  s.mixCaballo.setTime(t);
  s.mixJinete.stopAllAction();
  (atacando ? s.accionAtaque : s.accionSentado).play();
  s.mixJinete.setTime(atacando ? tJinete : s.sentadoT);
  s.lanza.visible = !atacando;
  s.espada.visible = atacando;
  s.scene.updateMatrixWorld(true);

  // Los ejes del caballo en el mundo: adelante, arriba y a su izquierda. Siguen
  // al torso del caballo, no solo a la dirección: al morir se tumba, y el jinete
  // (y su lanza) tienen que caer con él en vez de quedarse sentados en el aire.
  const huesoTorso = hueso(s.caballo, 'Torso');
  const torso = huesoTorso.getWorldPosition(new THREE.Vector3());
  // ejes = torso ahora · torso en reposo⁻¹ (que ya lleva la guiñada dentro).
  const ejes = huesoTorso
    .getWorldQuaternion(new THREE.Quaternion())
    .multiply(s.torsoReposo.clone().invert());
  const delta = ejes.clone().multiply(s.pivote.quaternion.clone().invert());
  const adelante = v(0, 0, 1).applyQuaternion(ejes).normalize();
  const arriba = v(0, 1, 0).applyQuaternion(delta).normalize();
  const izquierda = arriba.clone().cross(adelante).normalize();
  const en = (base, ad, ar, iz) =>
    base.clone().addScaledVector(adelante, ad).addScaledVector(arriba, ar).addScaledVector(izquierda, iz);

  // El jinete: la cadera sobre la silla.
  const P = s.prefijo;
  const caderas = hueso(s.ybot, `${P}Hips`);
  s.jinete.quaternion.copy(ejes);
  s.scene.updateMatrixWorld(true);
  const silla = en(torso, aj.sillaAdelante, aj.sillaArriba, 0);
  const ahora = caderas.getWorldPosition(new THREE.Vector3());
  s.jinete.position.add(silla.clone().sub(ahora));
  s.scene.updateMatrixWorld(true);

  // Piernas a los estribos, rodillas hacia delante y afuera.
  for (const [lado, signo] of [['Left', 1], ['Right', -1]]) {
    const estribo = en(torso, aj.estriboAdelante, aj.estriboArriba, signo * aj.estriboLado);
    const pista = adelante.clone().addScaledVector(izquierda, signo * 0.6).normalize();
    cadena(hueso(s.ybot, `${P}${lado}UpLeg`), hueso(s.ybot, `${P}${lado}Leg`), hueso(s.ybot, `${P}${lado}Foot`), estribo, pista);
  }

  if (atacando) {
    const antebrazoE = hueso(s.ybot, `${P}LeftForeArm`).getWorldPosition(new THREE.Vector3());
    s.escudo.position.copy(en(antebrazoE, 0.05, -0.02, 0.1));
    s.escudo.quaternion.setFromUnitVectors(v(0, 0, 1), izquierda);
    s.renderer.render(s.scene, s.camara);
    return s.renderer.domElement.toDataURL('image/png');
  }

  // Mano izquierda a las riendas, derecha a la lanza.
  const cuello = hueso(s.caballo, 'Neck1').getWorldPosition(new THREE.Vector3());
  const riendas = en(cuello, -0.15, 0.05, 0.12);
  cadena(hueso(s.ybot, `${P}LeftArm`), hueso(s.ybot, `${P}LeftForeArm`), hueso(s.ybot, `${P}LeftHand`), riendas, v(0, -1, 0).addScaledVector(izquierda, 0.5));
  const hombro = hueso(s.ybot, `${P}RightArm`).getWorldPosition(new THREE.Vector3());
  const cargando = postura === 'carga';
  const manoLanza = cargando ? en(hombro, 0.2, -0.25, 0.05) : en(hombro, 0.15, -0.35, -0.2);
  cadena(hueso(s.ybot, `${P}RightArm`), hueso(s.ybot, `${P}RightForeArm`), hueso(s.ybot, `${P}RightHand`), manoLanza, v(0, -1, 0).addScaledVector(izquierda, -0.4));

  // La lanza: en alto al paso; bajada y hacia delante en la carga.
  const mano = hueso(s.ybot, `${P}RightHand`).getWorldPosition(new THREE.Vector3());
  const dirLanza = cargando
    ? adelante.clone().addScaledVector(arriba, -0.08).normalize()
    : arriba.clone().addScaledVector(adelante, 0.12).normalize();
  s.lanza.position.copy(mano);
  s.lanza.quaternion.setFromUnitVectors(v(0, 1, 0), dirLanza);

  // El escudo, en el antebrazo izquierdo, de cara afuera.
  const antebrazo = hueso(s.ybot, `${P}LeftForeArm`).getWorldPosition(new THREE.Vector3());
  // Pegado al antebrazo y de cara afuera: su normal (+Z de la forma) a la izquierda del caballo.
  s.escudo.position.copy(en(antebrazo, 0.05, -0.02, 0.1));
  s.escudo.quaternion.setFromUnitVectors(v(0, 0, 1), izquierda);

  s.renderer.render(s.scene, s.camara);
  return s.renderer.domElement.toDataURL('image/png');
};

/** Gira caballo y jinete hacia la guiñada pedida (las 8 direcciones de la hoja). */
window.__girar = function girar(guinada) {
  estado.pivote.rotation.y = guinada;
  estado.pivote.updateMatrixWorld(true);
};

window.__listo = true;

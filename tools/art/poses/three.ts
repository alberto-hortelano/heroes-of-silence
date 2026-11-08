/**
 * El JavaScript que corre en la página de sprite-forge, junto a three.js: se pega en
 * texto al final de su `page.mjs` (`prepararForge`, en `render.ts`). El punto más
 * bajo de la malla, el atrezo de cada arma, las piernas de colores y los huesos que se
 * apuntan en cada fotograma (`HUESOS_DEL_MANIQUI`).
 *
 * Aquí no se importa three: son cadenas, y `THREE` es el de la página. Vivían en
 * `tools/art/poses.ts` (H4 de la reorganización, 08-11-2026).
 */

/**
 * La altura del punto más bajo de la MALLA deformada, en metros: lo que toca el
 * suelo. No vale el hueso más bajo: la punta del pie es un hueso dentro de la
 * bota, y con el pie de puntillas la suela quedaba unos centímetros en el aire.
 */
export const PUNTO_MAS_BAJO = `
function puntoMasBajo(model) {
  let y = Infinity;
  const v = new THREE.Vector3();
  model.updateMatrixWorld(true);
  model.traverse((n) => {
    if (!n.isSkinnedMesh) return;
    n.skeleton.update();
    const total = n.geometry.attributes.position.count;
    for (let i = 0; i < total; i += 1) {
      n.getVertexPosition(i, v).applyMatrix4(n.matrixWorld);
      if (v.y < y) y = v.y;
    }
  });
  return y;
}
`;

/**
 * El atrezo del maniquí: una espada (un palo con guarda) en la mano derecha y un
 * escudo de cometa plano en el antebrazo izquierdo. Con el arma dibujada en la
 * referencia, el modelo de imagen copia su largo y su ángulo en vez de
 * inventarlos (como la lanza del jinete en `montura/escena.js`). Gris como el
 * maniquí: dice forma, no aspecto.
 *
 * No se cuelgan del hueso con un giro elegido a ojo (la primera vez salió la
 * hoja por el lado del meñique): se colocan en cada fotograma con la anatomía.
 *  - La espada va por la línea de los nudillos, del meñique al índice, que es el
 *    eje del puño cerrado; la hoja sale por el lado del índice y el pulgar.
 *  - El escudo cuelga por fuera del antebrazo izquierdo, separado de él, con el
 *    antebrazo cruzando su cara interior y la punta hacia abajo.
 */
export const ATREZO = `
// Cada arma se crea con su función de colocar: \`crearAtrezo\` elige una vez y en
// cada fotograma se llama a \`atrezo.colocar(suelo, aplanar, frente, disparo)\`.
// \`disparo\` es \`{ tension, tensa }\` en un fotograma de disparo y \`null\` en
// cualquier otro.
function crearAtrezo(model, prefijo, conf) {
  let material = null;
  model.traverse((n) => { if (!material && n.isMesh) material = Array.isArray(n.material) ? n.material[0] : n.material; });
  // Una copia: el del maniquí puede pasar a colores de vértice (las piernas) y
  // el atrezo no los tiene, así que con el mismo material saldría negro.
  material = material.clone();
  const p = huesoEn(model, prefijo);
  if (conf.arco) return crearArco(p, conf, material);
  if (conf.ballesta) return crearBallesta(model, p, conf, material);
  return crearArmaDeMano(model, prefijo, p, conf, material);
}
function crearArmaDeMano(model, prefijo, p, conf, material) {
  const e = conf.espada;
  const espada = new THREE.Group();
  const r = e.grosor ?? 0.022;
  const hoja = new THREE.Mesh(new THREE.CylinderGeometry(r, r, e.largo, 8), material);
  hoja.position.y = e.agarre + e.largo / 2;
  // El orden y las medidas de hoja, guarda y puño son los de las espadas ya
  // aprobadas: cambiarlos movía unos píxeles sus poses.
  const rp = e.grosor === undefined ? 0.02 : Math.max(0.02, r);
  const puño = new THREE.Mesh(new THREE.CylinderGeometry(rp, rp, e.puño, 8), material);
  puño.position.y = e.agarre - e.puño / 2;
  const punta = e.agarre + e.largo;
  if (e.guarda > 0) {
    const guarda = new THREE.Mesh(new THREE.BoxGeometry(e.guarda, 0.03, 0.035), material);
    guarda.position.y = e.agarre;
    espada.add(hoja, guarda, puño);
  } else {
    espada.add(hoja, puño);
  }
  // Una bola en la punta: la cabeza de la maza o la bola del mayal.
  if (e.cabeza) {
    const bola = new THREE.Mesh(new THREE.SphereGeometry(e.cabeza, 12, 8), material);
    bola.position.y = punta;
    espada.add(bola);
  }
  // Un cono: la punta de la lanza.
  if (e.moharra) {
    const cono = new THREE.Mesh(new THREE.ConeGeometry(r * 2.6, e.moharra, 8), material);
    cono.position.y = punta + e.moharra / 2;
    espada.add(cono);
  }
  // Una esfera: el remate del báculo de un mago.
  if (e.remate === 'esfera') {
    const esfera = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), material);
    esfera.position.y = punta + 0.075;
    espada.add(esfera);
  }
  // La hoja de la alabarda: una hacha plana a un lado del asta, bajo la punta.
  if (e.remate === 'hacha') {
    const hacha = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.02), material);
    hacha.position.set(0.1, punta - 0.12, 0);
    espada.add(hacha);
  }
  // Una cruz: el remate del bastón y del báculo.
  if (e.remate === 'cruz') {
    const palo = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.24, 0.035), material);
    palo.position.y = punta + 0.12;
    const brazo = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.035), material);
    brazo.position.y = punta + 0.16;
    espada.add(palo, brazo);
  }
  // Un libro en la mano izquierda.
  const libro = conf.libro ? new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.22, 0.06), material) : null;
  // Una daga en la mano izquierda: la de parada del duelista.
  let daga = null;
  if (conf.daga) {
    daga = new THREE.Group();
    const hojaDaga = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, conf.daga.largo, 6), material);
    hojaDaga.position.y = 0.05 + conf.daga.largo / 2;
    const guardaDaga = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.03), material);
    guardaDaga.position.y = 0.05;
    daga.add(hojaDaga, guardaDaga);
  }
  // Una granada en la mano izquierda: una bola de hierro con la mecha asomando,
  // hasta que la suelta en el disparo; después del tiro la mano va vacía.
  let granada = null;
  if (conf.granada) {
    granada = new THREE.Group();
    const bola = new THREE.Mesh(new THREE.SphereGeometry(conf.granada.radio, 14, 10), material);
    const mecha = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, conf.granada.mecha, 5), material);
    mecha.position.y = conf.granada.radio + conf.granada.mecha / 2;
    granada.add(bola, mecha);
  }
  let escudo = null;
  if (conf.rodela) {
    // La rodela: un disco redondo en vez de la cometa.
    escudo = new THREE.Mesh(new THREE.CylinderGeometry(conf.rodela, conf.rodela, 0.03, 24), material);
    escudo.geometry.rotateX(Math.PI / 2);
  } else if (conf.escudo) {
    const forma = new THREE.Shape();
    forma.moveTo(-0.24, 0.3);
    forma.lineTo(0.24, 0.3);
    forma.lineTo(0.2, -0.05);
    forma.lineTo(0, -0.45);
    forma.lineTo(-0.2, -0.05);
    forma.closePath();
    escudo = new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: 0.03, bevelEnabled: false }), material);
  }
  const atrezo = { espada, escudo, libro, daga, granada };
  return {
    // El orden de las piezas en la escena es el orden en que se pintan: con
    // otro, donde dos piezas se tocan podría ganar la otra y cambiar un píxel.
    piezas: [espada, escudo, libro, daga, granada].filter(Boolean),
    colocar: (suelo, aplanar, frente, disparo) => colocarArmaDeMano(model, prefijo, p, atrezo, conf, suelo, aplanar, frente, disparo),
  };
}
// Un tramo recto de radio r y largo 1 en y: se coloca y se estira entre dos
// puntos en cada fotograma (la cuerda, que se tensa).
function tramo(material, r) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 6), material);
}
function estirarEntre(tramo, a, b) {
  const d = b.clone().sub(a);
  const largo = d.length();
  tramo.position.copy(a).add(b).multiplyScalar(0.5);
  tramo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), largo > 1e-6 ? d.divideScalar(largo) : new THREE.Vector3(0, 1, 0));
  tramo.scale.set(1, Math.max(1e-4, largo), 1);
}
// El arco: la empuñadura en el origen, el eje largo en y y la panza hacia +x;
// las palas se curvan hacia -x, que es el lado de la cuerda. Así su cara (z) es
// la que queda arriba cuando se tumba en el suelo, como la del escudo.
function crearArco(p, conf, material) {
  const a = conf.arco;
  const curva = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-a.combadura, -a.largo / 2, 0),
    new THREE.Vector3(a.combadura, 0, 0),
    new THREE.Vector3(-a.combadura, a.largo / 2, 0),
  );
  const arco = new THREE.Mesh(new THREE.TubeGeometry(curva, 24, a.grosor, 6, false), material);
  const puntas = [curva.getPoint(0), curva.getPoint(1)];
  const cuerda = [tramo(material, 0.006), tramo(material, 0.006)];
  const flecha = tramo(material, 0.008);
  const piezas = [arco, ...cuerda, flecha];
  let aljaba = null;
  if (conf.aljaba) {
    aljaba = new THREE.Group();
    const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.55, 10), material);
    aljaba.add(tubo);
    // Tres astiles asomando por la boca: sin ellos, a 160 px, es un termo. Con
    // plumas de caja se leían como dedos o como orejas junto a la cabeza.
    for (const [x, z] of [[0.025, 0.01], [-0.02, 0.015], [0, -0.025]]) {
      const astil = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.1, 5), material);
      astil.position.set(x, 0.32, z);
      aljaba.add(astil);
    }
    piezas.push(aljaba);
  }
  const atrezo = { arco, puntas, cuerda, flecha, aljaba };
  return {
    piezas,
    colocar: (suelo, aplanar, frente, disparo) => colocarArco(p, atrezo, conf, suelo, aplanar, frente, disparo),
  };
}
// La ballesta: el tablero a lo largo de y, con el agarre en el origen; el arco
// transversal en x, delante, curvado hacia atrás; la cara de arriba en +z.
function crearBallesta(model, p, conf, material) {
  const b = conf.ballesta;
  const ballesta = new THREE.Group();
  // Sin palas es un arma de fuego (arcabuz, culebrina, rifle): culata y cañón,
  // sin arco, cuerda ni virote. Con el arco, el arcabucero salía con ballesta.
  if (!(b.palas > 0)) {
    const culata = new THREE.Mesh(new THREE.BoxGeometry(0.05, b.atras + 0.15, 0.08), material);
    culata.position.y = (0.15 - b.atras) / 2;
    const canon = new THREE.Mesh(new THREE.CylinderGeometry(b.grosor, b.grosor, b.delante - 0.1, 8), material);
    canon.position.set(0, 0.1 + (b.delante - 0.1) / 2, 0.02);
    ballesta.add(culata, canon);
    const atrezo = { ballesta, virote: null };
    return {
      piezas: [ballesta],
      colocar: (suelo, aplanar, frente, disparo, anim) => colocarBallesta(model, p, atrezo, conf, suelo, aplanar, frente, disparo, anim),
    };
  }
  const tablero = new THREE.Mesh(new THREE.BoxGeometry(0.05, b.delante + b.atras, 0.07), material);
  tablero.position.y = (b.delante - b.atras) / 2;
  const curva = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-b.palas / 2, b.delante - b.combadura, 0),
    new THREE.Vector3(0, b.delante + b.combadura, 0),
    new THREE.Vector3(b.palas / 2, b.delante - b.combadura, 0),
  );
  const palas = new THREE.Mesh(new THREE.TubeGeometry(curva, 20, b.grosor, 6, false), material);
  const cuerda = tramo(material, 0.006);
  estirarEntre(cuerda, curva.getPoint(0), curva.getPoint(1));
  // El virote sobre el tablero: se ve hasta que se dispara.
  const virote = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, b.delante + 0.06, 5), material);
  virote.position.set(0, (b.delante + 0.06) / 2, 0.045);
  ballesta.add(tablero, palas, cuerda, virote);
  const atrezo = { ballesta, virote };
  return {
    piezas: [ballesta],
    colocar: (suelo, aplanar, frente, disparo, anim) => colocarBallesta(model, p, atrezo, conf, suelo, aplanar, frente, disparo, anim),
  };
}
function huesoEn(model, prefijo) {
  return (nombre) => {
    const h = model.getObjectByName(prefijo + nombre);
    if (!h) throw new Error('el rig no tiene el hueso ' + prefijo + nombre);
    return h.getWorldPosition(new THREE.Vector3());
  };
}
// El eje del puño cerrado de una mano: la línea de los nudillos, del meñique al
// índice; y su centro, en el hueco de los dedos.
function ejeDeNudillos(p, lado) {
  const indice = p(lado + 'HandIndex1'), meñique = p(lado + 'HandPinky1');
  const eje = indice.clone().sub(meñique).normalize();
  const centro = indice.clone().add(meñique).multiplyScalar(0.5).lerp(p(lado + 'HandMiddle2'), 0.5);
  return { eje, centro };
}
// Lleva \`eje\` hasta que apunte, como mínimo, \`minimo\` (coseno) hacia \`hacia\`.
function inclinar(eje, hacia, minimo) {
  if (!(minimo > 0)) return;
  const d = eje.dot(hacia);
  if (d >= minimo) return;
  const resto = eje.clone().addScaledVector(hacia, -d);
  if (resto.lengthSq() < 1e-6) resto.set(1, 0, 0);
  resto.normalize();
  eje.copy(resto.multiplyScalar(Math.sqrt(1 - minimo * minimo)).addScaledVector(hacia, minimo)).normalize();
}
// La pista de la IK para el codo: hacia abajo, abierto \`afuera\` por \`lateral\` y
// \`adelante\` por \`frente\`.
function codoHacia(lateral, frente, afuera, adelante) {
  return new THREE.Vector3(0, -1, 0).addScaledVector(lateral, afuera).addScaledVector(frente, adelante).normalize();
}
// Al morir, una pieza plana se tumba con el cuerpo hasta quedar en el suelo con
// su cara (z) hacia arriba y su largo (y) por donde apuntaba \`eje\`, bajo \`centro\`.
function tumbar(objeto, eje, centro, suelo, w, alto) {
  if (!(w > 0)) return;
  const largo = new THREE.Vector3(eje.x, 0, eje.z);
  if (largo.lengthSq() < 1e-6) largo.set(0, 0, 1);
  largo.normalize();
  const cara = new THREE.Vector3(0, 1, 0);
  const ancho = new THREE.Vector3().crossVectors(largo, cara).normalize();
  const plano = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ancho, largo, cara));
  const enSuelo = new THREE.Vector3(centro.x, suelo + alto, centro.z);
  objeto.quaternion.slerp(plano, w);
  objeto.position.lerp(enSuelo, w);
}
function colocarArmaDeMano(model, prefijo, p, atrezo, conf, suelo, aplanar, frente, disparo) {
  // La espada: el puño en el hueco de los dedos, la hoja hacia el índice.
  const { eje, centro } = ejeDeNudillos(p, 'Right');
  // La hoja (o el asta) no puede cruzar el cuerpo: los clips son de espada y
  // escudo, con la derecha en la cadera, y siguiendo los nudillos una hoja larga
  // atravesaba el torso. Se la inclina hasta un mínimo hacia delante (dos manos,
  // lanza) o hacia arriba (bastón, que va de pie junto al cuerpo).
  inclinar(eje, frente, conf.adelanteMinimo);
  inclinar(eje, new THREE.Vector3(0, 1, 0), conf.arribaMinimo ?? 0);
  // Mientras la izquierda lanza la granada, el sable va bajo, junto a la pierna y
  // algo adelantado: de punta arriba subía por delante de la cara y tapaba el
  // tiro, y hacia delante se salía de la celda.
  if (disparo && atrezo.granada) inclinar(eje, frente.clone().multiplyScalar(0.4).setY(-1).normalize(), 0.95);
  atrezo.espada.position.copy(centro);
  atrezo.espada.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), eje);
  // A dos manos las dos manos cogen el puño delante del cuerpo, en el centro:
  // del clip se toman la dirección de la hoja y la altura y el alcance de la
  // mano derecha; se le quita el desvío lateral y se lleva cada mano a su sitio
  // del puño con la IK de dos huesos (la derecha junto a la guarda, la izquierda
  // debajo), con los codos hacia abajo.
  if (conf.dosManos) {
    const pechoD = p('Spine2');
    const lateral = new THREE.Vector3().crossVectors(frente, new THREE.Vector3(0, 1, 0)).normalize();
    const agarre = centro.clone();
    agarre.addScaledVector(lateral, -agarre.clone().sub(pechoD).dot(lateral) * conf.centrado);
    const alcance = agarre.clone().sub(pechoD).dot(frente);
    if (alcance < conf.alcanceMinimo) agarre.addScaledVector(frente, conf.alcanceMinimo - alcance);
    // Que lo alcancen los dos brazos sin estirarse del todo: con el brazo
    // recto el codo cae sobre la línea hombro-mano y no hay arco que formar,
    // y si no llega, la mano se queda corta del puño.
    for (const lado of ['Right', 'Left']) {
      const hombro = p(lado + 'Arm');
      const largo = hombro.distanceTo(p(lado + 'ForeArm')) + p(lado + 'ForeArm').distanceTo(p(lado + 'Hand'));
      const hasta = agarre.clone().sub(hombro);
      const maximo = largo * conf.estiramiento;
      if (hasta.length() > maximo) agarre.copy(hombro).addScaledVector(hasta.normalize(), maximo);
    }
    // Los codos hacia fuera de su lado, abajo y algo adelante: con los dos hacia
    // abajo el brazo derecho se plegaba dentro del pecho, y sin la parte de
    // delante se iba detrás del torso. Hombro y mano no se mueven; solo gira el
    // plano del brazo, que forma un arco.
    const codo = (lado) => codoHacia(lateral, frente, lado * conf.codosAfuera, conf.codosAdelante);
    poseArm(model, 'Right', agarre, codo(1));
    const manoIzquierda = agarre.clone().addScaledVector(eje, -conf.separacionManos);
    poseArm(model, 'Left', manoIzquierda, codo(-1));
    centro.copy(agarre);
    atrezo.espada.position.copy(centro);
  }
  if (atrezo.daga) {
    // Como la espada, por la línea de los nudillos de la izquierda.
    const izq = ejeDeNudillos(p, 'Left');
    inclinar(izq.eje, frente, conf.adelanteMinimo);
    atrezo.daga.position.copy(izq.centro);
    atrezo.daga.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), izq.eje);
  }
  if (atrezo.granada) {
    // En el hueco de los dedos de la izquierda, hasta que la suelta en el disparo.
    const { centro: enLaMano } = ejeDeNudillos(p, 'Left');
    const g = conf.granada;
    atrezo.granada.position.copy(enLaMano);
    atrezo.granada.visible = !disparo || disparo.tensa;
    // Al morir la suelta: rueda hasta el suelo junto a la mano.
    if (aplanar > 0) atrezo.granada.position.lerp(new THREE.Vector3(enLaMano.x, suelo + g.radio, enLaMano.z), aplanar);
  }
  if (atrezo.libro) {
    const mano = model.getObjectByName(prefijo + 'LeftHand');
    atrezo.libro.position.copy(p('LeftHand')).lerp(p('LeftHandMiddle2'), 0.6);
    atrezo.libro.quaternion.copy(mano.getWorldQuaternion(new THREE.Quaternion()));
  }
  if (!atrezo.escudo) return;
  // El escudo: normal hacia fuera del cuerpo, perpendicular al antebrazo.
  const codo = p('LeftForeArm'), muñeca = p('LeftHand'), pecho = p('Spine2');
  const brazo = muñeca.clone().sub(codo).normalize();
  const medio = codo.clone().add(muñeca).multiplyScalar(0.5);
  const fuera = medio.clone().sub(pecho);
  fuera.addScaledVector(brazo, -fuera.dot(brazo)).normalize();
  const arriba = new THREE.Vector3().crossVectors(fuera, brazo).normalize();
  if (arriba.y < 0) arriba.negate();
  const lado = new THREE.Vector3().crossVectors(arriba, fuera).normalize();
  atrezo.escudo.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(lado, arriba, fuera));
  atrezo.escudo.position.copy(medio).addScaledVector(fuera, 0.07).addScaledVector(arriba, 0.04);
  // Al morir, el escudo se tumba con el cuerpo hasta quedar plano en el suelo,
  // bajo el antebrazo y con la cara hacia arriba.
  tumbar(atrezo.escudo, arriba, medio, suelo, aplanar, 0.005);
}
// Pone \`objeto\` en \`centro\` con su eje largo (y) por \`eje\` y su x por \`cara\`
// (la panza del arco, el arco transversal de la ballesta); z sale de las dos.
function orientar(objeto, centro, eje, cara) {
  const z = new THREE.Vector3().crossVectors(cara, eje).normalize();
  objeto.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(cara, eje, z));
  objeto.position.copy(centro);
}
// El arco va en la IZQUIERDA. Fuera del disparo, por la línea de los nudillos
// como la espada, con la panza hacia donde apunta el antebrazo; en el disparo,
// vertical y con la panza de la mano de la cuerda a la del arco, para que la
// derecha quede en su plano y la cuerda no tire de lado.
function colocarArco(p, atrezo, conf, suelo, aplanar, frente, disparo) {
  const izq = ejeDeNudillos(p, 'Left');
  const der = ejeDeNudillos(p, 'Right');
  const eje = izq.eje.clone();
  const cara = new THREE.Vector3();
  if (disparo) {
    eje.set(0, 1, 0);
    cara.copy(izq.centro).sub(der.centro).setY(0);
    if (cara.lengthSq() < 1e-6) cara.copy(frente);
    cara.normalize();
    // Con la cuerda floja las dos manos están juntas y su línea es de lado: la
    // panza no puede apuntar menos que esto hacia donde mira.
    inclinar(cara, frente, conf.panzaAdelanteMinimo);
  } else {
    // Los clips mueven el puño como si llevara espada: a la carrera, por los
    // nudillos, el arco iba en horizontal como una barra. Se lo pone de pie.
    inclinar(eje, new THREE.Vector3(0, eje.y < 0 ? -1 : 1, 0), conf.arribaMinimo);
    cara.copy(p('LeftHand')).sub(p('LeftForeArm'));
    cara.addScaledVector(eje, -cara.dot(eje));
    if (cara.lengthSq() < 1e-6) cara.copy(frente);
    cara.normalize();
  }
  orientar(atrezo.arco, izq.centro, eje, cara);
  tumbar(atrezo.arco, eje, izq.centro, suelo, aplanar, conf.arco.grosor);
  atrezo.arco.updateMatrixWorld(true);
  const puntas = atrezo.puntas.map((v) => atrezo.arco.localToWorld(v.clone()));
  // La cuerda va a la mano derecha mientras está tensa; floja (tensión 0,1 o
  // menos, o ya suelta), recta entre las puntas: con las manos juntas en el
  // primer fotograma, engancharla daba una V de lado.
  const tensa = disparo !== null && disparo.tensa && disparo.tension > 0.1;
  const gancho = tensa ? der.centro : puntas[0].clone().add(puntas[1]).multiplyScalar(0.5);
  estirarEntre(atrezo.cuerda[0], puntas[0], gancho);
  estirarEntre(atrezo.cuerda[1], gancho, puntas[1]);
  // La flecha, solo en la cuerda: de la mano derecha hacia el arco, y asoma por delante.
  atrezo.flecha.visible = tensa;
  if (tensa) {
    const hacia = izq.centro.clone().sub(gancho).normalize();
    estirarEntre(atrezo.flecha, gancho, gancho.clone().addScaledVector(hacia, conf.flecha));
  }
  if (atrezo.aljaba) colocarAljaba(p, atrezo.aljaba);
}
// La aljaba, a la espalda y con la boca hacia el hombro derecho, que es por
// donde saca la flecha. La base sale de los hombros y del cuello, no de los
// ejes locales del hueso: así no hay que adivinar hacia dónde mira cada uno.
function colocarAljaba(p, aljaba) {
  const pecho = p('Spine2');
  const arriba = p('Neck').sub(p('Spine1')).normalize();
  const derecha = p('RightArm').sub(p('LeftArm'));
  derecha.addScaledVector(arriba, -derecha.dot(arriba)).normalize();
  const atras = new THREE.Vector3().crossVectors(derecha, arriba).normalize();
  const eje = arriba.clone().multiplyScalar(Math.cos(0.35)).addScaledVector(derecha, Math.sin(0.35)).normalize();
  const lado = new THREE.Vector3().crossVectors(eje, atras).normalize();
  aljaba.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(lado, eje, atras));
  aljaba.position.copy(pecho).addScaledVector(atras, 0.16).addScaledVector(arriba, -0.05);
}
// La ballesta va en la DERECHA. En el disparo apunta a donde mira, encarada, y
// la izquierda sujeta el tablero por delante con la misma IK que el agarre a
// dos manos, con el codo abierto hacia fuera.
function colocarBallesta(model, p, atrezo, conf, suelo, aplanar, frente, disparo, anim) {
  const arriba = new THREE.Vector3(0, 1, 0);
  // Fuera del disparo y de la muerte se lleva con las DOS manos delante del
  // cuerpo, terciada y algo baja, siguiendo al torso en cada fotograma: con
  // los clips de espada la derecha iba en la cadera con la ballesta colgando
  // al lado y la izquierda libre, y el modelo de imagen la pintaba flotando o
  // cogida con una mano (lo vio el usuario el 05-10-2026). En la muerte se
  // suelta y cae con la mano, como antes.
  if (!disparo && anim !== 'death') {
    const lateral = new THREE.Vector3().crossVectors(frente, arriba).normalize();
    const agarre = p('Spine2')
      .addScaledVector(frente, 0.3)
      .addScaledVector(arriba, -0.24)
      .addScaledVector(lateral, 0.1);
    const eje = frente.clone().multiplyScalar(Math.cos(conf.bajaEnReposo)).addScaledVector(arriba, -Math.sin(conf.bajaEnReposo))
      .addScaledVector(lateral, -0.35).normalize();
    poseArm(model, 'Right', agarre, codoHacia(lateral, frente, 0.6, 0));
    poseArm(model, 'Left', agarre.clone().addScaledVector(eje, conf.separacionManos), codoHacia(lateral, frente, -0.6, 0));
  }
  const der = ejeDeNudillos(p, 'Right');
  const eje = der.eje.clone();
  if (disparo) {
    eje.copy(frente);
    const lateral = new THREE.Vector3().crossVectors(frente, arriba).normalize();
    const apoyo = der.centro.clone().addScaledVector(frente, conf.separacionManos).add(new THREE.Vector3(0, -0.03, 0));
    poseArm(model, 'Left', apoyo, codoHacia(lateral, frente, -0.5, 0));
  } else {
    // Fuera del disparo apunta adelante, algo baja y cruzada hacia la
    // izquierda, de la mano derecha a la izquierda, con la cara de arriba
    // arriba. Por los nudillos, como la lanza, el reposo de espada la
    // levantaba sobre el hombro y se leía como un pico.
    const lateral = new THREE.Vector3().crossVectors(frente, arriba).normalize();
    eje.copy(frente).multiplyScalar(Math.cos(conf.bajaEnReposo)).add(new THREE.Vector3(0, -Math.sin(conf.bajaEnReposo), 0));
    if (anim !== 'death') eje.addScaledVector(lateral, -0.35);
    eje.normalize();
    arriba.addScaledVector(eje, -arriba.dot(eje)).normalize();
  }
  const lado = new THREE.Vector3().crossVectors(eje, arriba).normalize();
  orientar(atrezo.ballesta, der.centro, eje, lado);
  if (atrezo.virote) atrezo.virote.visible = disparo === null || disparo.tensa;
  tumbar(atrezo.ballesta, eje, der.centro, suelo, aplanar, 0.04);
}
`;

/**
 * Las piernas del maniquí en dos colores, para que el modelo de imagen no las
 * confunda en la marcha ni gire la figura de espaldas: la DERECHA roja y la
 * IZQUIERDA azul (lo dice el prompt, y que el personaje no lleva esos colores).
 * Cada vértice toma el color de su hueso dominante; el resto del cuerpo, el gris
 * de siempre.
 */
export const PIERNAS = `
function colorearPiernas(model) {
  const rojo = new THREE.Color(0.8, 0.08, 0.06);
  const azul = new THREE.Color(0.08, 0.22, 0.85);
  model.traverse((n) => {
    if (!n.isSkinnedMesh) return;
    const g = n.geometry;
    const indices = g.attributes.skinIndex, pesos = g.attributes.skinWeight;
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    const gris = mats[0].color.clone();
    const total = g.attributes.position.count;
    const colores = new Float32Array(total * 3);
    for (let i = 0; i < total; i += 1) {
      let hueso = 0, peso = -1;
      for (let k = 0; k < 4; k += 1) {
        const w = pesos.getComponent(i, k);
        if (w > peso) { peso = w; hueso = indices.getComponent(i, k); }
      }
      const nombre = n.skeleton.bones[hueso]?.name ?? '';
      const c = /Right(UpLeg|Leg|Foot|Toe)/.test(nombre) ? rojo : /Left(UpLeg|Leg|Foot|Toe)/.test(nombre) ? azul : gris;
      colores[i * 3] = c.r; colores[i * 3 + 1] = c.g; colores[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colores, 3));
    for (const m of mats) { m.vertexColors = true; m.color.set(0xffffff); m.needsUpdate = true; }
  });
}
`;

/**
 * Los huesos de Mixamo que se apuntan por fotograma: el muñeco de palos del
 * maniquí. `HeadTop_End` da la coronilla; los pies, el tobillo y la punta.
 */
export const HUESOS_DEL_MANIQUI = [
  'Hips',
  'Spine',
  'Spine2',
  'Neck',
  'Head',
  'HeadTop_End',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'LeftToeBase',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
  'RightToeBase',
] as const;

/**
 * En la página, antes de pintar el fotograma `f`: cada hueso proyectado por la
 * cámara a píxeles de la celda, `[x, y, z]` con `z` la profundidad de la cámara
 * (menos, más cerca); el mismo hueso en el MUNDO de la figura (`mundo`, en metros:
 * y hacia arriba con el suelo en 0, +z hacia donde mira y la rotación de la
 * dirección deshecha, para medir el sentido de la marcha igual en las ocho), y cada
 * pieza visible del atrezo por los dos extremos de su eje más largo. Lo recoge
 * `render.mjs` por dirección (`window.__huesos`).
 */
export const HUESOS = `
function apuntarHuesos(f) {
  const { scene, camera, renderer, model, prefijo, atrezo, pivot, suelo } = state;
  scene.updateMatrixWorld(true);
  const W = renderer.domElement.width, H = renderer.domElement.height;
  const px = (v) => { const q = v.clone().project(camera); return [Math.round((q.x + 1) / 2 * W), Math.round((1 - q.y) / 2 * H), +q.z.toFixed(4)]; };
  // El pivote solo gira en y (la dirección) y sube o baja para apoyar los pies: x y
  // z salen de su marco; la altura, del suelo del reposo. Los píxeles, enteros, y el
  // mundo, en centímetros: con más cifras los ~800 esqueletos pasaban de 20 MB en git.
  const enElMundo = (v) => { const l = pivot.worldToLocal(v.clone()); return [+l.x.toFixed(2), +(v.y - suelo).toFixed(2), +l.z.toFixed(2)]; };
  const huesos = {};
  const mundo = {};
  for (const nombre of ${JSON.stringify(HUESOS_DEL_MANIQUI)}) {
    const h = model.getObjectByName(prefijo + nombre);
    if (!h) continue;
    const v = h.getWorldPosition(new THREE.Vector3());
    huesos[nombre] = px(v);
    mundo[nombre] = enElMundo(v);
  }
  const piezas = [];
  for (const pieza of atrezo?.piezas ?? []) {
    if (!pieza.visible) continue;
    const caja = new THREE.Box3();
    pieza.updateMatrixWorld(true);
    const inversa = pieza.matrixWorld.clone().invert();
    pieza.traverse((n) => {
      if (!n.isMesh || !n.visible) return;
      n.geometry.computeBoundingBox();
      caja.union(n.geometry.boundingBox.clone().applyMatrix4(n.matrixWorld.clone().premultiply(inversa)));
    });
    if (caja.isEmpty()) continue;
    const t = caja.getSize(new THREE.Vector3()), c = caja.getCenter(new THREE.Vector3());
    const eje = t.x >= t.y && t.x >= t.z ? 'x' : t.y >= t.z ? 'y' : 'z';
    const a = c.clone(), b = c.clone();
    a[eje] = caja.min[eje]; b[eje] = caja.max[eje];
    piezas.push([px(a.applyMatrix4(pieza.matrixWorld)), px(b.applyMatrix4(pieza.matrixWorld))]);
  }
  window.__huesos = window.__huesos ?? {};
  window.__huesos[f] = { huesos, mundo, atrezo: piezas };
}
`;

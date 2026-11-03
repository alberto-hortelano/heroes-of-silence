# uso: python3 perturbar.py <repo> <P>  — perturba data/ de forma válida
import json, sys
R, P = sys.argv[1], sys.argv[2]
def leer(f): return json.load(open(f'{R}/data/{f}.json'))
def escribir(f, d):
    with open(f'{R}/data/{f}.json', 'w') as h: json.dump(d, h, ensure_ascii=False, indent=2); h.write('\n')
def clamp(x, a, b): return max(a, min(b, x))
U = leer('unidades'); E = leer('equipo')
us, ps = U['unidades'], E['piezas']
toca = set()
if P == 'P0':
    toca = {'unidades', 'equipo', 'economia', 'asaltantes', 'heroe', 'buildings', 'ciudades', 'liderazgo', 'experiencia', 'poder', 'carga', 'rueda', 'poderes', 'spells', 'granada', 'muralla'}
if P == 'P1':  # fuerza y PV ×2, ataque +2, liderazgo +1
    for u in us:
        u['fuerza'] *= 2; u['hp'] *= 2; u['attack'] += 2
    H = leer('heroe'); H['combate']['pv']['base'] *= 2; H['combate']['fuerza']['base'] *= 2; escribir('heroe', H)
    toca = {'unidades'}
if P == 'P2':  # fuerza y PV ×0,5, ataque −1
    for u in us:
        u['fuerza'] = max(1, round(u['fuerza'] / 2)); u['hp'] = max(1, round(u['hp'] / 2)); u['attack'] = max(0, u['attack'] - 1)
    H = leer('heroe'); H['combate']['pv']['base'] //= 2; H['combate']['fuerza']['base'] = 3; escribir('heroe', H)
    toca = {'unidades'}
if P == 'P3':  # agilidad ±1 alternando, dentro de 2..7
    for i, u in enumerate(us):
        d = 1 if i % 2 == 0 else -1
        n = u['agilidad'] + d
        if n < 2 or n > 7: n = u['agilidad'] - d
        u['agilidad'] = n
    H = leer('heroe'); H['combate']['agilidad'] = 5; escribir('heroe', H)
    toca = {'unidades'}
if P == 'P4':  # precios y economía
    for p in ps:
        if 'precio' in p: p['precio'] = p['precio'] * 3 if p['precio'] > 0 else 50
        if 'extras' in p and isinstance(p['extras'], dict) and 'precio' in p['extras']: p['extras']['precio'] *= 3
    Ec = leer('economia')
    Ec['oroPorIndice']['divisor'] = 700; Ec['crecimientoPorNivel'] = [10, 7, 6, 4, 3, 1]
    Ec['rentaDelPueblo'] = 400; Ec['costeDeLaMorada'] = [300, 1500, 3000, 9000, 10000, 25000]
    Ec['oroDeSalida'] = 40000; Ec['precioDelHeroe'] = 3500
    escribir('economia', Ec)
    B = leer('buildings')
    for b in B['buildings']:
        if b.get('cost'): b['cost'] = b['cost'] * 2
        if b.get('income'): b['income'] = b['income'] + 250
    escribir('buildings', B)
    toca = {'equipo'}
if P == 'P5':  # otros nombres
    for u in us: u['name'] = u['name'] + ' Nuevo'
    for p in ps:
        if 'nombre' in p: p['nombre'] = p['nombre'] + ' Nueva'
    toca = {'unidades', 'equipo'}
if P == 'P6':  # cifras de las piezas
    for i, p in enumerate(ps):
        h = p.get('hueco')
        t = p if 'hueco' in p else p.get('extras', {})
        if 'base' in p: continue
        if h in ('arma', 'distancia'):
            p['ataque'] = p.get('ataque', 0) + 1
            p['fuerza'] = p.get('fuerza', 0) + 1
        if h == 'armadura' and p.get('armadura', 0) > 0: p['armadura'] += 1
        if h == 'escudo': p['defensa'] = p.get('defensa', 0) + 1
        if h == 'montura':
            p['fuerza'] += 2; p['agilidad'] = clamp(p['agilidad'] - 1, 2, 7)
        p['peso'] = p.get('peso', 0) + 1
        if 'rueda' in p:
            for j, k in enumerate(p['rueda']):
                d = 1 if (i + j) % 2 == 0 else -1
                n = p['rueda'][k] + d
                if n < 0 or n > 6: n = p['rueda'][k] - d
                p['rueda'][k] = n
        if 'recarga' in p: p['recarga'] = clamp(p['recarga'] + 1, 1, 9)
        if 'cargas' in p: p['cargas'] = p['cargas'] + 1
        if p.get('tiro') == 'fuego' and 'agilidad' in p: p['agilidad'] = clamp(p['agilidad'] + 1, 1, 7)
    toca = {'equipo'}
if P == 'P7':  # asaltantes, guarniciones, liderazgo
    A = leer('asaltantes')
    A['fuerzaMax'] *= 2; A['liderazgoMax'] += 6; A['pasosPorDia'] = 3; A['probabilidadSemanal'] = 0.7
    for c in A['composiciones']:
        for g in c: g['count'] = max(1, g['count'] - 1)
    escribir('asaltantes', A)
    C = leer('ciudades')
    for k, v in C.items():
        if isinstance(v, dict):
            for f, gs in v.items():
                if isinstance(gs, list):
                    for g in gs:
                        if isinstance(g, dict) and 'count' in g: g['count'] = max(1, g['count'] - 1)
    escribir('ciudades', C)
    L = leer('liderazgo'); L['heroe']['base'] = 26; L['heroe']['porRango'] = 6; L['guarnicion'] = 26; L['personaje'] = 8
    escribir('liderazgo', L)
if P == 'P8':  # progresión y combate: experiencia, poder, carga, rueda, poderes, hechizos, granada, muralla, héroe
    X = leer('experiencia'); X['base'] = 4000; X['porRango']['ataque'] = 2; escribir('experiencia', X)
    Po = leer('poder'); Po['umbralDelNivel2'] = 900; Po['armaduraDeReferencia'] = 12; Po['pesoDeLaRecarga'] = 3; escribir('poder', Po)
    Ca = leer('carga'); Ca['porcentaje'] = 7; Ca['tope'] = 4; escribir('carga', Ca)
    Ru = leer('rueda')
    Ru['fuerte']['porcentaje'] = [100, 120, 140, 160, 180, 190, 210]
    Ru['rapido']['porcentaje'] = [30, 40, 55, 65, 80, 90, 100]
    Ru['ofensivo']['ataque'] = [0, 1, 3, 4, 5, 6, 7]
    Ru['defensivo']['defensa'] = [0, 2, 3, 4, 5, 6, 8]
    Ru['romperGuardia']['conExitoMaximo'] = [0, -1, -1, -2, -4, -5, -7]
    Ru['finta']['conExitoMinimo'] = [9, 8, 6, 5, 4, 3, 1]
    escribir('rueda', Ru)
    Pd = leer('poderes'); Pd['poderes'][0]['cura'] = 20; escribir('poderes', Pd)
    Sp = leer('spells')
    for s in Sp['spells']:
        for k in ('basePower', 'perPower'):
            if k in s: s[k] = s[k] * 2
        if 'cost' in s: s['cost'] += 1
    escribir('spells', Sp)
    G = leer('granada'); G['cuartoDelCentro'] = 3; G['cuartoDelAnillo'] = 1; escribir('granada', G)
    M = leer('muralla'); M['defensaEnLoAlto'] = 4; escribir('muralla', M)
    H = leer('heroe'); H['combate']['pv']['porRango'] = 80; H['combate']['ataquePorRango'] = 2; H['rendicion']['porcentajeDelOro'] = 60; escribir('heroe', H)
if P == 'P9':  # liderazgo de las unidades: −1 donde se puede, y el de los héroes
    for i, u in enumerate(us):
        u['leadership'] = max(1, u['leadership'] - 1) if i % 2 == 0 else u['leadership']
    L = leer('liderazgo'); L['heroe']['base'] = 22; L['heroe']['max'] = 55; escribir('liderazgo', L)
    toca = {'unidades'}

if P == 'Q1':  # fuerza +1 y PV +5 en todas, ataque +1
    for u in us: u['fuerza'] += 1; u['hp'] += 5; u['attack'] += 1
    toca = {'unidades'}
if P == 'Q2':  # agilidad ±1 en la otra alternancia
    for i, u in enumerate(us):
        d = -1 if i % 2 == 0 else 1
        n = u['agilidad'] + d
        if n < 2 or n > 7: n = u['agilidad'] - d
        u['agilidad'] = n
    toca = {'unidades'}
if P == 'Q3':  # cifras de las piezas, hacia el otro lado
    for i, p in enumerate(ps):
        if 'base' in p: continue
        h = p.get('hueco')
        if h in ('arma', 'distancia'):
            if p.get('ataque', 0) > 0: p['ataque'] -= 1
            p['fuerza'] = p.get('fuerza', 0) + 2
        if h == 'armadura' and p.get('armadura', 0) > 1: p['armadura'] -= 1
        if h == 'escudo' and p.get('defensa', 0) > 1: p['defensa'] -= 1
        if h == 'montura': p['agilidad'] = clamp(p['agilidad'] + 1, 2, 7)
        if p.get('peso', 0) > 0: p['peso'] -= 1
        if 'rueda' in p:
            for j, k in enumerate(p['rueda']):
                d = -1 if (i + j) % 2 == 0 else 1
                n = p['rueda'][k] + d
                if n < 0 or n > 6: n = p['rueda'][k] - d
                p['rueda'][k] = n
    toca = {'equipo'}
if P == 'Q4':  # otros nombres de lo demás: edificios, hechizos, tipos de héroe, poderes
    B = leer('buildings')
    for b in B['buildings']: b['name'] = b['name'] + ' X'
    escribir('buildings', B)
    Sp = leer('spells')
    for x in Sp['spells']: x['name'] = x['name'] + ' X'
    escribir('spells', Sp)
    T = leer('tipos-de-heroe')
    for f, ts in T['tipos'].items():
        for t in ts: t['nombre'] = t['nombre'] + ' X'
    escribir('tipos-de-heroe', T)
    Pd = leer('poderes'); Pd['poderes'][0]['nombre'] = 'Sanar'; escribir('poderes', Pd)
if P == 'Q5':  # economía hacia el otro lado y precios /2
    for p in ps:
        if p.get('precio', 0) > 0: p['precio'] = max(10, p['precio'] // 2)
    Ec = leer('economia')
    Ec['oroPorIndice']['divisor'] = 400; Ec['crecimientoPorNivel'] = [14, 9, 6, 5, 3, 2]
    Ec['rentaDelPueblo'] = 150; Ec['oroDeSalida'] = 20000; Ec['precioDelHeroe'] = 2000
    escribir('economia', Ec)
    toca = {'equipo'}
if P == 'Q6':  # ataque −1 y PV ×1,5, y los pesos de la IA en la rueda
    for u in us: u['attack'] = max(0, u['attack'] - 1); u['hp'] = u['hp'] * 3 // 2
    Ru = leer('rueda')
    for papel in Ru['pesos']:
        for i, k in enumerate(Ru['pesos'][papel]): Ru['pesos'][papel][k] = 1 + (i % 3)
    escribir('rueda', Ru)
    toca = {'unidades'}
if P == 'Q7':  # asaltantes hacia el otro lado
    A = leer('asaltantes')
    A['pasosPorDia'] = 1; A['probabilidadSemanal'] = 0.3; A['liderazgoMax'] = 30
    escribir('asaltantes', A)
    C = leer('ciudades')
    for f, gs in C['guarnicionNeutral'].items(): gs.reverse()
    escribir('ciudades', C)
if P == 'Q8':  # progresión hacia el otro lado
    X = leer('experiencia'); X['base'] = 2000; X['porRango']['fuerza'] = 2; escribir('experiencia', X)
    Po = leer('poder'); Po['umbralDelNivel2'] = 500; Po['armaduraDeReferencia'] = 6; escribir('poder', Po)
    Ca = leer('carga'); Ca['porcentaje'] = 4; Ca['tope'] = 6; escribir('carga', Ca)
    L = leer('liderazgo'); L['heroe']['max'] = 60; escribir('liderazgo', L)
    H = leer('heroe'); H['combate']['pv']['base'] = 250; H['combate']['fuerza']['base'] = 7; H['combate']['agilidad'] = 3; escribir('heroe', H)
    Pd = leer('poderes'); Pd['poderes'][0]['cura'] = 8; escribir('poderes', Pd)
    G = leer('granada'); G['cuartoDelCentro'] = 3; escribir('granada', G)

if P == 'R1':  # solo los PV ×2 (unidades y héroe)
    for u in us: u['hp'] *= 2
    H = leer('heroe'); H['combate']['pv']['base'] *= 2; escribir('heroe', H)
    toca = {'unidades'}
if P == 'R2':  # los extras de las piezas con base
    for p in ps:
        if 'base' in p:
            x = p['extras']
            x['ataque'] = x.get('ataque', 0) + 1
            if 'oro' in x: x['oro'] *= 2
            if 'rueda' in x:
                for k in x['rueda']: x['rueda'][k] = 0
    toca = {'equipo'}
if P == 'R3':  # hechizos y poderes
    Sp = leer('spells')
    for x in Sp['spells']:
        if 'amount' in x: x['amount'] = x['amount'] + (1 if x['amount'] > 0 else -1)
        if 'basePower' in x: x['basePower'] += 10
        if 'cost' in x: x['cost'] += 2
    escribir('spells', Sp)
    Pd = leer('poderes'); Pd['poderes'][0]['cura'] = 30; escribir('poderes', Pd)
if P == 'R4':  # composiciones de asaltantes y guarnición de las bases
    A = leer('asaltantes')
    A['composiciones'].reverse()
    for c in A['composiciones']:
        for g in c: g['count'] = max(1, g['count'] - 2)
    escribir('asaltantes', A)
    C = leer('ciudades')
    for f, gs in C['guarnicionBase'].items():
        for g in gs: g['count'] = max(1, g['count'] - 1)
    escribir('ciudades', C)
if P == 'R5':  # liderazgo de las unidades +1 donde cabe
    for i, u in enumerate(us):
        if i % 3 == 0 and u['leadership'] <= 3: u['leadership'] += 1
    L = leer('liderazgo'); L['guarnicion'] = 30; L['heroe']['base'] = 24; escribir('liderazgo', L)
    toca = {'unidades'}
if P == 'R6':  # el peso de todas las piezas ×2
    for p in ps:
        if 'peso' in p: p['peso'] = p['peso'] * 2
    toca = {'equipo'}
if P in ('R1', 'R2', 'R5', 'R6', 'P1', 'P2', 'P3', 'P6', 'P9', 'Q1', 'Q2', 'Q3', 'Q6', 'Q8'):  # el techo de los asaltantes se valida contra el catálogo: subirlo es parte de editarlo
    A = leer('asaltantes'); A['fuerzaMax'] = 3000; escribir('asaltantes', A)
for f in toca:
    escribir(f, U if f == 'unidades' else E if f == 'equipo' else leer(f))

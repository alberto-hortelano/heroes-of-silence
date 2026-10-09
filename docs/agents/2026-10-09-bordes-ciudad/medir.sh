#!/bin/bash
# Uso: medir.sh <etiqueta> [hasta=200]: 8 procesos de 25 semillas; junta en <etiqueta>.json
cd "$(dirname "$0")/../../.." || exit 1
D=docs/agents/2026-10-09-bordes-ciudad/medidas; mkdir -p $D
H=${2:-200}; P=$(( (H + 7) / 8 ))
for i in 0 1 2 3 4 5 6 7; do
  a=$((i * P + 1)); b=$(( (i + 1) * P )); [ $b -gt $H ] && b=$H
  npx tsx docs/agents/2026-10-09-bordes-ciudad/medir.ts $a $b $D/$1-$i.json 2>/dev/null &
done
wait
node -e '
const fs=require("fs");const d=process.argv[1],t=process.argv[2];
const f=[];for(let i=0;i<8;i++)f.push(...JSON.parse(fs.readFileSync(`${d}/${t}-${i}.json`)));
f.sort((a,b)=>a.semilla-b.semilla);fs.writeFileSync(`${d}/${t}.json`,JSON.stringify(f,null,0));
for(let i=0;i<8;i++)fs.unlinkSync(`${d}/${t}-${i}.json`);
const sum=(r)=>{const o={};for(const x of r)for(const[k,v]of Object.entries(x.informe))o[k]=(o[k]??0)+v;return o};
console.log("1-40",JSON.stringify(sum(f.filter(x=>x.semilla<=40))));
console.log("todo",JSON.stringify(sum(f)));
for(const x of f)for(const c of x.cortadas)console.log(`s${x.semilla} y${c.y} ${c.a}-${c.b} ${c.cerca.join(" ")}`);
' $D $1

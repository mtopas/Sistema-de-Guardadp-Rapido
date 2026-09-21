function o(t,e){const a=[t||"",(e||"").replace(/<[^>]*>/g," ")].join(" ").match(/#([a-zA-Z]\w*)/g)||[];return[...new Set(a.map(c=>c.slice(1).toLowerCase()))]}export{o as e};

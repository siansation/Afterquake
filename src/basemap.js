// Street tiles are optional: the bundled land map, pins and forecast remain usable
// while they load or when the connection fails. Request only the visible viewport.
const BASEMAP = (() => {
  function create(L, map, status, {schedule=setTimeout,cancel=clearTimeout}={}) {
    const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      pane:'streets',maxZoom:13,updateWhenIdle:true,updateWhenZooming:false,
      keepBuffer:0,detectRetina:false,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    let active=false,loaded=0,errors=0,timer=null;
    const clear=()=>{if(timer!==null)cancel(timer);timer=null};
    const message=text=>{status.textContent=text;status.hidden=!text};
    const delayed=()=>message('Street details unavailable. You can still use the map.');
    tiles.on('loading',()=>{
      if(!active)return;
      clear();loaded=errors=0;message('Loading roads and place names…');
      timer=schedule(()=>{timer=null;if(active&&!loaded)delayed()},8000);
    });
    // Show each tile as it arrives; never wait for the slowest tile or the model.
    tiles.on('tileload',()=>{if(active){loaded++;clear();message('')}});
    tiles.on('tileerror',()=>{if(active)errors++});
    tiles.on('load',()=>{
      if(!active)return;
      clear();if(errors&&!loaded)delayed();else message('');
    });
    function show(){if(active)return;active=true;tiles.addTo(map)}
    function hide(){active=false;clear();if(map.hasLayer(tiles))map.removeLayer(tiles);message('')}
    function retry(){if(active){loaded=errors=0;tiles.redraw()}}
    return {show,hide,retry};
  }
  return {create};
})();
if (typeof module !== 'undefined') module.exports = BASEMAP;

declare var d3: any;

export class Cell {
  private _parent: any;
  public svg: any;
  public renderLinks: any[] = [];
  public outerRadius: number;
  public innerRadius: number;
  public bubbleRadius: number;
  public linkRadius: number;
  public nodesTranslate: any;
  public chordsTranslate: number;
  public topMargin: number;
  public chordsSvg: any;
  public linksSvg: any;
  public nodesSvg: any;
  public bubble: any;
  public chord: any;
  public diagonal: any;
  public arc: any;
  public labelChords: any[];
  public format = d3.format(",d");
  public linkGroup;
  public circleList = [];
  public listFrom = [];
  public listTo = [];
  public transactions = [];
  public listFromById = {}; 
  public chordsById = {}; 
  public nodesById = {};
  public formatNumber = d3.format(",.0f");
  public formatCurrency = a => "$" + this.formatNumber(a);
  public indexByName = {};
  public nameByIndex: any;
  public chords = [];

  constructor(containerId: string, chartId: string) {
    this._parent = d3.select(`#${containerId}`);
    let box = this._parent.node().getBoundingClientRect();
    this._parent.node().appendChild(this._toSVG(chartId, box.width * 0.6, box.height * 0.6));
    this.svg = this._parent.select("svg");
    this.svg.select("defs")
      .append("style")
        .text(`.link { fill: none; stroke: #ccc; stroke-width: 1.5px; stroke-linecap: round }
        text.chord { font-size: 8px }`);
    this.outerRadius = box.width * .25;
    this.innerRadius = .9 * this.outerRadius;
    this.bubbleRadius = this.innerRadius - 50;
    this.linkRadius = .95 * this.innerRadius;
    this.nodesTranslate = this.outerRadius -this.innerRadius + (this.innerRadius - this.bubbleRadius);
    this.chordsTranslate = this.outerRadius;
    this.topMargin = .15 * this.innerRadius;
    this.chordsSvg = this.svg.append("g")
      .attr("class", "chords")
      .attr("transform", "translate(" + this.chordsTranslate + "," + (this.chordsTranslate + this.topMargin) + ")");
    this.linksSvg = this.svg.append("g")
      .attr("class", "links")
      .attr("transform", "translate(" + this.chordsTranslate + "," + (this.chordsTranslate + this.topMargin) + ")");
    this.nodesSvg = this.svg.append("g")
      .attr("class", "nodes")
      .attr("transform", "translate(" + this.nodesTranslate + "," + (this.nodesTranslate + this.topMargin) + ")");
    this.bubble = d3.layout.pack()
      .sort(null)
      .size([2 * this.bubbleRadius, 2 * this.bubbleRadius])
      .padding(1.5);
    this.chord = d3.layout.chord()
      .padding(.05)
      .sortSubgroups(d3.descending)
      .sortChords(d3.descending);
    this.diagonal = d3.svg.diagonal.radial();
    this.arc = d3.svg.arc()
      .innerRadius(this.innerRadius)
      .outerRadius(this.innerRadius + 10);
  }

  public main() {
    const toList = [];
    this.listTo.forEach(r => {
      toList.push({
        children: r, value: 0
      });
    })

    const nodes = this.bubble.nodes({ children: toList, type: "root" });
    nodes.forEach(a => {
      if (a.depth === 2) {
        this.nodesById[a.toId] = a;
        a.relatedLinks = [];
        a.currentValue = a.value;
        this.circleList.push(a);
      }
    });

    this.buildChords();
    this.transactions.forEach(co => {
      this.nodesById[co.toId].relatedLinks.push(co);
      this.chordsById[co.fromId].relatedLinks.push(co);
    })
    this.updateNodes();
    this.updateChords();
  
    let transIndex = this.transactions.length - 1;
    let nibble = transIndex * 0.25;
    let intervalId = window.setInterval(() => {
      if (transIndex < 0) {
        window.clearInterval(intervalId);
      } else {
        for (let a = 0; a < nibble; a++) {
          if (transIndex > -1) {
            this.renderLinks.push(this.transactions[transIndex--]);
          }
        }
        this.updateLinks(this.renderLinks);
      }
    }, 1);
  }

  public tooltipHide() {
    const toolTip = d3.select("#toolTip");
    toolTip.transition()
      .duration(500)
      .style("opacity", "0");
  }
  
  public node_onMouseOver(data: any, category: string): void {
    let pos = d3.event.pageX + 15;
    if (pos + 250 > window.innerWidth) {
      pos = d3.event.pageX - 280;
    }
    if (category === "TO") {
      if (data.depth < 2) { return; }
      this.tooltipMessage(pos, 
        data.label, 
        "Contribution", 
        "Total Recieved: " + this.formatCurrency(data.value)
      );
      this.highlightLinks(data, true);
    } else {
      if (category === "TRANSACTION") {
        this.tooltipMessage(pos, 
          this.nodesById[data.toId].label,
          this.listFromById[data.fromId].label, 
          this.formatCurrency(data.value)
        );      
        this.highlightLink(data, true);
      } else {
        if (category === "FROM") {
          this.tooltipMessage(d3.event.pageX + 15, 
            this.listFromById[data.fromId].label, 
            "Political Action Committee", 
            "Total Contributions: " + this.formatCurrency(this.listFromById[data.fromId].value)
          );        
          this.highlightLinks(this.chordsById[data.fromId], true);
        }
      }
    }
  }
  
  public node_onMouseOut(a, b) {
    if (b === "TO") {
      this.highlightLinks(a, false);
    } else {
      if (b === "TRANSACTION") {
        this.highlightLink(a, false);
      } else {
        if (b === "FROM") {
          this.highlightLinks(this.chordsById[a.fromId], false);
        }
      }
    }
    this.tooltipHide();
  }
  
  public highlightLinks(a, show) { a.relatedLinks.forEach(a => this.highlightLink(a, show)); }
  
  public buildChords() {
    let a = [];
    this.labelChords = [];
    let indexByName = [];
    let nameByIndex = [];
    let n = 0;
    let e = 0;
    this.listFrom.forEach(a => {
      a = a.fromId;
      nameByIndex[n] = a;
      indexByName[a] = n++;
    });
    this.listFrom.forEach(b => {
      let c = indexByName[b.fromId];
      let d = a[c];
      if (!d) {
        d = a[c] = [];
        for (let f = -1; ++f < n;) {
          d[f] = 0;
        }
      }
      d[indexByName[b.fromId]] = b.value;
      e += b.value;
    });
    this.chord.matrix(a);
    this.chords = this.chord.chords();
    let f = 90 * Math.PI / 180;
    let b = 0;
    this.chords.forEach((a, index) => {
      a.fromId = nameByIndex[index];
      a.angle = (a.source.startAngle + a.source.endAngle) / 2;
      this.chordsById[a.fromId] = {
        currentAngle: a.source.startAngle,
        currentLinkAngle: a.source.startAngle,
        endAngle: a.source.endAngle,
        index: a.source.index,
        relatedLinks: [],
        source: a.source,
        startAngle: a.source.startAngle,
        value: a.source.value
      };

      this.labelChords.push({
        angle: a.angle + f,
        endAngle: a.source.endAngle + f / 2,
        fromId: a.fromId,
        startAngle: a.source.startAngle - f / 2
      });

      b++;
    });
  }

  public b(a) {
    let b = { x: undefined, y: undefined };
    let c = { x: undefined, y: undefined };
    let d = { source: undefined, target: undefined };
    let e = { source: undefined, target: undefined };
    let f = { x: undefined, y: undefined };
    let g = this.chordsById[a.fromId];
    let h = this.nodesById[a.toId];
    let i = this.linkRadius;
    let j = (
      i * Math.cos(g.currentLinkAngle - 1.57079633), 
      i * Math.sin(g.currentLinkAngle - 1.57079633), 
      g.currentLinkAngle - 1.57079633);
    g.currentLinkAngle = g.currentLinkAngle + a.value / g.value * (g.endAngle - g.startAngle);
    let k = g.currentLinkAngle - 1.57079633;
    c.x = i * Math.cos(j);
    c.y = i * Math.sin(j);
    b.x = h.x - (this.chordsTranslate - this.nodesTranslate);
    b.y = h.y - (this.chordsTranslate - this.nodesTranslate);
    f.x = i * Math.cos(k);
    f.y = i * Math.sin(k);
    d.source = c;
    d.target = b;
    e.source = b;
    e.target = f;
    return [d, e];
  }
  
  public updateLinks(a) {
    this.linkGroup = this.linksSvg.selectAll("g.nodelink")
      .data(a, d => d.transId);
  
    let c = this.linkGroup.enter()
      .append("g")
        .attr("class", "nodelink");

    this.linkGroup.transition();
    
    c.append("g")
      .attr("class", "arc")
      .append("path")
        .attr("id", d => "a_" + d.transId)
        .style("fill", d => d.fill)
        .style("fill-opacity", .2)
        .attr("d", (a, b) => {
          let c = { endAngle: undefined, startAngle: undefined, value: undefined };
          let d = this.chordsById[a.fromId];
          c.startAngle = d.currentAngle;
          d.currentAngle = d.currentAngle + a.value / d.value * (d.endAngle - d.startAngle);
          c.endAngle = d.currentAngle;
          c.value = a.value;
          let e = d3.svg.arc(a, b)
            .innerRadius(this.linkRadius)
            .outerRadius(this.innerRadius);
          return e(c, b)
        })
        .on("mouseover", d => this.node_onMouseOver(d, "TRANSACTION"))
        .on("mouseout", d => this.node_onMouseOut(d, "TRANSACTION"));
  
    c.append("path")
      .attr("class", "link")
      .attr("id", d => "l_" + d.transId)
      .attr("d", (d, i) => {
        d.links = this.b(d);
        let path = this.diagonal(d.links[0], i);
        path += `L${String(this.diagonal(d.links[1], i)).substr(1)}A${this.linkRadius},${this.linkRadius} 0 0,0 ${d.links[0].source.x},${d.links[0].source.y}`;
        return path;
      })
      .style("stroke", d => d.fill)
      .style("stroke-opacity", .07)
      .style("fill-opacity", .1)
      .style("fill", d => d.fill)
      .on("mouseover", d => this.node_onMouseOver(d, "TRANSACTION"))
      .on("mouseout", d => this.node_onMouseOut(d, "TRANSACTION"));
        
    c.append("g")
      .attr("class", "node")
      .append("circle")
        .style("fill", d => d.fill)
        .style("fill-opacity", .2)
        .style("stroke-opacity", 1)
        .attr("r", d => {
          let b = this.nodesById[d.toId];
          b.currentValue = b.currentValue - d.value;
          let c = (b.value - b.currentValue) / b.value;
          return b.r * c;
        })
        .attr("transform", d => "translate(" + d.links[0].target.x + "," + d.links[0].target.y + ")");
  
    this.linkGroup.exit().remove()
  }
  
  public updateNodes() {
    let a = this.nodesSvg.selectAll("g.node")
      .data(this.circleList, d => d.toId);
  
    let b = a.enter()
      .append("g")
        .attr("class", "node")
        .attr("transform", d => "translate(" + d.x + "," + d.y + ")");
    
    b.append("circle")
      .attr("r", d => d.r)
      .style("fill-opacity", d => d.depth < 2 ? 0 : .05)
      .style("stroke", d => d.fill)
      .style("stroke-opacity", d => d.depth < 2 ? 0 : .2)
      .style("fill", d => d.fill);
    
    let c = b.append("g")
      .attr("id", d => "c_" + d.toId)
      .style("opacity", 0);
  
    c.append("circle")
      .attr("r", d => d.r + 2)
      .style("fill-opacity", 0)
      .style("stroke", "#FFF")
      .style("stroke-width", 2.5)
      .style("stroke-opacity", .7);
    
    c.append("circle")
      .attr("r", d => d.r)
      .style("fill-opacity", 0)
      .style("stroke", "#000")
      .style("stroke-width", 1.5)
      .style("stroke-opacity", 1)
      .on("mouseover", d => this.node_onMouseOver(d, "TO"))
      .on("mouseout", d => this.node_onMouseOut(d, "TO"));
    
    a.exit().remove()
      .transition(500)
      .style("opacity", 0);
  }
  
  public updateChords() {
    let a = this.chordsSvg.selectAll("g.arc")
      .data(this.chords, d => d.fromId);
  
    let b = a.enter()
      .append("g")
        .attr("class", "arc");
  
    let defs = this.svg.select("defs");
  
    let c = defs.selectAll(".arcDefs")
      .data(this.labelChords, d => d.fromId);
  
    c.enter().append("path")
      .attr("class", "arcDefs")
      .attr("id", d => `labelArc_${d.fromId}`);
  
    b.append("path")
      .style("fill-opacity", 0)
      .style("stroke", "#555")
      .style("stroke-opacity", .4);
  
    b.append("text")
      .attr("class", "chord")
      .attr("id", d => `t_${d.fromId}`)
      .on("mouseover", d => this.node_onMouseOver(d, "FROM"))
      .on("mouseout", d => this.node_onMouseOut(d, "FROM"))
      .style("font-size", "0px")
      .style("fill", "#777")
      .append("textPath")
      .text(d => this.listFromById[d.fromId].label)
      .attr("text-anchor", "middle")
      .attr("startOffset", "50%")
      .style("overflow", "visible")
      .attr("xlink:href", d => `#labelArc_${d.fromId}`);
      
    c.attr("d", d => {
      let ac = d3.svg.arc()
        .innerRadius(1.05 *this.innerRadius)
        .outerRadius(1.05 *this.innerRadius)(d);
      const re = /[Mm][\d\.\-e,\s]+[Aa][\d\.\-e,\s]+/;
      const path = re.exec(ac)[0];
      return path;
    });
  
    a.transition()
      .select("path")
      .attr("d", (a, b) => {
        let c = d3.svg.arc(a, b)
          .innerRadius(.95 *this.innerRadius)
          .outerRadius(this.innerRadius);
        return c(a.source, b);
      });
  
    c.exit().remove();
    a.exit().remove();
  }

  public tooltipMessage(pos, h, h1, h2) {
    const toolTip = d3.select("#toolTip");
    toolTip.transition().duration(200).style("opacity", ".9");
    toolTip.select("#header1").text(h1);
    toolTip.select("#head").text(h);
    toolTip.select("#header2").text(h2);
    toolTip.style("left", pos + "px")
      .style("top", d3.event.pageY - 150 + "px")
      .style("height", "100px");
  }
  
  public trimLabel(a) { return a.length > 25 ? String(a).substr(0, 25) + "..." : a }
  
  public highlightLink(a, show) {
    let opac = show ? .6 : .1;
    d3.select("#l_" + a.transId)
      .transition(show ? 150 : 550)
      .style("fill-opacity", opac)
      .style("stroke-opacity", opac);
    d3.select("#a_" + a.transId)
      .transition()
      .style("fill-opacity", show ? opac : .2);
    d3.select("#c_" + a.toId)
      .transition(show ? 150 : 550)
      .style("opacity", show ? 1 : 0);
    d3.select("#t_" + a.fromId)
      .transition(show ? 0 : 550)
      .style("fill", show ? "#000" : "#777")
      .style("font-size", show ? Math.round(.035 *this.innerRadius) + "px" : "0px")
  }

  private _toNodes(template) {
    return new DOMParser().parseFromString(template, "text/html").body.childNodes[0];
  }

  private _toSVG(id, width, height) {
    return this._toNodes(`<svg id ="${id}"
      aria-labelledBy="title" role="presentation"
      preserveAspectRatio="xMinYMin meet"
      height="100%" width="100%" viewBox="0 0 ${width} ${height}"
      xmlns="http://www.w3.org/2000/svg"
      xmlns:xlink="http://www.w3.org/1999/xlink">
      <title lang="en">Chart</title>
      <defs>
        <style type="text/css">
          svg {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 0.9em;
            user-select: none
          }
        </style>
      </defs>
      <g class="canvas"></g>
      <g class="pending">
        <rect height="100%" width="100%" fill="#eee" stroke="#ccc"></rect>
        <text y="50%" x="50%" alignment-baseline="central" fill="#666" style="font-size:1.1em" text-anchor="middle">Data pending</text>
      </g>
    </svg>`);
  }
}

/* force directed graph with direction arrows and multiple edges

References

http://jsfiddle.net/zhanghuancs/a2QpA/
https://bl.ocks.org/mattkohl/146d301c0fc20d89d85880df537de7b0
http://bl.ocks.org/fancellu/2c782394602a93921faff74e594d1bb1
*/


/* arc helpers */

function radian(ux, uy, vx, vy) {
    var dot = ux * vx + uy * vy;
    var mod = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    var rad = Math.acos(dot / mod);
    if (ux * vy - uy * vx < 0.0) {
        rad = -rad;
    }
    return rad;
}
//conversion_from_endpoint_to_center_parameterization
//sample :  svgArcToCenterParam(200,200,50,50,0,1,1,300,200)
// x1 y1 rx ry φ fA fS x2 y2
function svgArcToCenterParam(x1, y1, rx, ry, phi, fA, fS, x2, y2) {
    var cx, cy, startAngle, deltaAngle, endAngle;
    var PIx2 = Math.PI * 2.0;

    if (rx < 0) {
        rx = -rx;
    }
    if (ry < 0) {
        ry = -ry;
    }
    if (rx == 0.0 || ry == 0.0) { // invalid arguments
        throw Error('rx and ry can not be 0');
    }

    var s_phi = Math.sin(phi);
    var c_phi = Math.cos(phi);
    var hd_x = (x1 - x2) / 2.0; // half diff of x
    var hd_y = (y1 - y2) / 2.0; // half diff of y
    var hs_x = (x1 + x2) / 2.0; // half sum of x
    var hs_y = (y1 + y2) / 2.0; // half sum of y

    // F6.5.1
    var x1_ = c_phi * hd_x + s_phi * hd_y;
    var y1_ = c_phi * hd_y - s_phi * hd_x;

    // F.6.6 Correction of out-of-range radii
    //   Step 3: Ensure radii are large enough
    var lambda = (x1_ * x1_) / (rx * rx) + (y1_ * y1_) / (ry * ry);
    if (lambda > 1) {
        rx = rx * Math.sqrt(lambda);
        ry = ry * Math.sqrt(lambda);
    }

    var rxry = rx * ry;
    var rxy1_ = rx * y1_;
    var ryx1_ = ry * x1_;
    var sum_of_sq = rxy1_ * rxy1_ + ryx1_ * ryx1_; // sum of square
    if (!sum_of_sq) {
        throw Error('start point can not be same as end point');
    }
    var coe = Math.sqrt(Math.abs((rxry * rxry - sum_of_sq) / sum_of_sq));
    if (fA == fS) { coe = -coe; }

    // F6.5.2
    var cx_ = coe * rxy1_ / ry;
    var cy_ = -coe * ryx1_ / rx;

    // F6.5.3
    cx = c_phi * cx_ - s_phi * cy_ + hs_x;
    cy = s_phi * cx_ + c_phi * cy_ + hs_y;

    var xcr1 = (x1_ - cx_) / rx;
    var xcr2 = (x1_ + cx_) / rx;
    var ycr1 = (y1_ - cy_) / ry;
    var ycr2 = (y1_ + cy_) / ry;

    // F6.5.5
    startAngle = radian(1.0, 0.0, xcr1, ycr1);

    // F6.5.6
    deltaAngle = radian(xcr1, ycr1, -xcr2, -ycr2);
    while (deltaAngle > PIx2) { deltaAngle -= PIx2; }
    while (deltaAngle < 0.0) { deltaAngle += PIx2; }
    if (fS == false || fS == 0) { deltaAngle -= PIx2; }
    endAngle = startAngle + deltaAngle;
    while (endAngle > PIx2) { endAngle -= PIx2; }
    while (endAngle < 0.0) { endAngle += PIx2; }

    var outputObj = { /* cx, cy, startAngle, deltaAngle */
        cx: cx,
        cy: cy,
        startAngle: startAngle,
        deltaAngle: deltaAngle,
        endAngle: endAngle,
        clockwise: (fS == true || fS == 1)
    }

    return outputObj;
}




/* ====== */

var colors = d3.scaleOrdinal(d3.schemeCategory10);

var svg = d3.select("svg"),
    width = +svg.attr("width"),
    height = +svg.attr("height"),
    node,
    link,
    linkPerp;

svg.append('defs')
    .append('marker')
    .attrs({
        'id': 'arrowhead',
        'viewBox': '-0 -5 10 10',
        'refX': 13,
        'refY': 0,
        'orient': 'auto',
        'markerWidth': 13,
        'markerHeight': 13,
        'xoverflow': 'visible'
    })
    .append('svg:path')
    .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
    .attr('fill', '#999')
    .style('stroke', 'none');


var simulation = d3.forceSimulation()
    .force("link", d3.forceLink().id(function (d) { return d.id; }).distance(500).strength(0.5))
    .force("charge", d3.forceManyBody())
    .force("center", d3.forceCenter(width / 2, height / 2));

function sortLinks(lks) {
    lks.sort(function (a, b) {
        if (a.source > b.source) {
            return 1;
        }
        else if (a.source < b.source) {
            return -1;
        }
        else {
            if (a.target > b.target) {
                return 1;
            }
            if (a.target < b.target) {
                return -1;
            }
            else {
                return 0;
            }
        }
    });
}

var mLinkNum = {};
function setLinkIndexAndNum(linksData) {
    //any links with duplicate source and target get an incremented 'linknum'
    for (var i = 0; i < linksData.length; i++) {
        if (i != 0 &&
            linksData[i].source == linksData[i - 1].source &&
            linksData[i].target == linksData[i - 1].target) {
            linksData[i].linkindex = linksData[i - 1].linkindex + 1;
        }
        else {
            linksData[i].linkindex = 1;
        }
        // save the total number of links between two nodes
        if (mLinkNum[linksData[i].target + "," + linksData[i].source] !== undefined) {
            mLinkNum[linksData[i].target + "," + linksData[i].source] = linksData[i].linkindex;
        }
        else {
            mLinkNum[linksData[i].source + "," + linksData[i].target] = linksData[i].linkindex;
        }
    }
}

d3.json("force/force.json", function (error, graph) {
    if (error) throw error;
    var linksData = graph.links
    sortLinks(linksData)
    setLinkIndexAndNum(linksData)
    update(linksData, graph.nodes);
})

function update(links, nodes) {
    link = svg.selectAll(".link")
        .data(links)
        .enter()
        // .append("line")
        .append("svg:path")
        .attr("class", "link")
        .attr('marker-end', 'url(#arrowhead)')



    link.append("title")
        .text(function (d) { return d.name; });

    linkPerp = svg.selectAll(".linkPerp")
        .data(links)
        .enter()
        // .append("line")
        .append("line")
        .attr("class", "linkPerp")
        .attr('marker-end', 'url(#arrowhead)')

    edgepaths = svg.selectAll(".edgepath")
        .data(links)
        .enter()
        .append('path')
        .attrs({
            'class': 'edgepath',
            'fill-opacity': 0,
            'stroke-opacity': 0,
            'id': function (d, i) { return 'edgepath' + i }
        })
        .style("pointer-events", "none");


    var pathInvis = svg.selectAll("path.invis")
        .data(links);

    pathInvis.enter().append("svg:path")
        .attr("id", function (d) {
            return "invis_" + d.source + "-" + d.id + "-" + d.target;
        })
        .attr("class", "invis");

    pathInvis.exit().remove();


    var pathLabel = svg.selectAll(".pathLabel")
        .data(links);

    pathLabel.enter().append("g").append("svg:text")
        .attr("class", "pathLabel")
        .append("svg:textPath")
        .attr("startOffset", "50%")
        .attr("text-anchor", "middle")
        .attr("xlink:href", function(d) { return "#invis_" + d.source + "-" + d.id + "-" + d.target; })
        .style("fill", "#cccccc")
        .style("font-size", 10)
        .text(function(d) { return d.name; });

    edgelabelswrap = svg.selectAll(".edgelabel")
        .data(links)
        .enter()
        .append('g')
        .attr("class", "edgelabelwrap")

    edgelabels = edgelabelswrap
        .append('svg:text')
        .style("pointer-events", "none")
        .attrs({
            'class': 'edgelabel',
            'id': function (d, i) { return 'edgelabel' + i },
            'font-size': 10,
            'fill': '#aaa'
        });

    edgelabeltext = edgelabels.append('textPath')
        .attr('xlink:href', function (d, i) { return '#edgepath' + i })
        .style("text-anchor", "middle")
        // .attr("xlink:href", function(d) { return "#invis_" + d.source.id + "-" + d.value + "-" + d.target.id; })
        .style("pointer-events", "none")
        .attr("startOffset", "50%")
        .text(function (d) { return d.name });

    node = svg.selectAll(".node")
        .data(nodes)
        .enter()
        .append("g")
        .attr("class", "node")
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            //.on("end", dragended)
        );

    node.append("circle")
        .attr("r", 5)
        .style("fill", function (d, i) { return colors(i); })

    node.append("title")
        .text(function (d) { return d.id; });

    node.append("text")
        .attr("dy", -3)
        .text(function (d) { return d.name + ":" + d.text; });

    simulation
        .nodes(nodes)
        .on("tick", ticked);

    simulation.force("link")
        .links(links);
}

function getCurvedLinePosition(d) {
    var dx = d.target.x - d.source.x,
        dy = d.target.y - d.source.y,
        dr = Math.sqrt(dx * dx + dy * dy);
    // get the total link numbers between source and target node
    var sideA = (d.linkindex % 2 === 1) ? 1 : 0;
    var sideB = (d.linkindex % 2 === 1) ? 0 : 1;
    var lTotalLinkNum = mLinkNum[d.source.id + "," + d.target.id] || mLinkNum[d.target.id + "," + d.source.id];
    if (lTotalLinkNum > 1) {
        // if there are multiple links between these two nodes, we need generate different dr for each path
        dr = dr / (1 + (1 / (lTotalLinkNum)) * (d.linkindex - 1 - sideB));
    }
    return [dr, sideA, sideB]
}

// function getArcLineCentre(d) {
//     const [dr, sideA, sideB] = getCurvedLinePosition(d);
//     const { cx, cy } = svgArcToCenterParam(d.target.x, d.target.y, dr, dr, 0, 0, sideA, d.source.x, d.source.y);
//     var x1 = d.target.x - (d.target.x - d.source.x) / 2;
//     var y1 = d.target.y - (d.target.y - d.source.y) / 2;

//     const drb = Math.sqrt((x1 - cx) ** 2 + (y1 - cy) ** 2)

//     var dx = d.target.x - d.source.x,
//         dy = d.target.y - d.source.y;


//     const m = -dy / dx
//     // const c = d.target.y - (m * d.target.x)

//     // y = 1.8 * Math.sqrt((dr * dr) / (1 + m * m))
//     // x = 1.8 * Math.sqrt((dr * dr) / (1 + (1 / m) * (1 / m)))
//     // y = Math.sqrt((drb  * 20) / (1 + m * m))
//     // x = Math.sqrt((drb  * 20) / (1 + (1 / m) * (1 / m)))
//     y = cy
//     x = cx
//     return [x, y]
// }
function getArcLineCentre(d) {
    const [dr, sideA, sideB] = getCurvedLinePosition(d);
    const { cx, cy } = svgArcToCenterParam(d.target.x, d.target.y, dr, dr, 0, 0, sideA, d.source.x, d.source.y);
    var x1 = d.target.x - (d.target.x - d.source.x) / 2;
    var y1 = d.target.y - (d.target.y - d.source.y) / 2;

    const drb = Math.sqrt((x1 - cx) ** 2 + (y1 - cy) ** 2)

    var dx = d.target.x - d.source.x,
        dy = d.target.y - d.source.y;


    const m = -dy / dx
    // const c = d.target.y - (m * d.target.x)

    // y = 1.8 * Math.sqrt((dr * dr) / (1 + m * m))
    // x = 1.8 * Math.sqrt((dr * dr) / (1 + (1 / m) * (1 / m)))
    // y = Math.sqrt((drb  * 20) / (1 + m * m))
    // x = Math.sqrt((drb  * 20) / (1 + (1 / m) * (1 / m)))
    y = cy - Math.sqrt((dr * dr) / (1 + m * m))
    x = cx - Math.sqrt((dr * dr) / (1 + (1 / m) * (1 / m)))
    return [x, y]
}

function getPerpLine(d) {
    var x_mult, y_mult
    if (d.target.x < d.source.x) {
        if (d.target.y < d.source.y) {
            // top left
            x_mult = 1
            y_mult = -1
        } else {
            // bottom left
            x_mult = -1
            y_mult = -1
        }
    }
    else {
        if (d.target.y < d.source.y) {
            // top right
            x_mult = 1
            y_mult = 1
        } else {
            x_mult = -1
            y_mult = 1
            // bottom right
        }
    }
    var x1 = d.target.x - (d.target.x - d.source.x) / 2;
    var y1 = d.target.y - (d.target.y - d.source.y) / 2;
    var x2 = x_mult * getArcLineCentre(d)[0] + d.target.x - (d.target.x - d.source.x) / 2;
    var y2 = y_mult * getArcLineCentre(d)[1] + d.target.y - (d.target.y - d.source.y) / 2;
    return [x1, y1, x2, y2]
}

function ticked() {
    link.attr("d", function (d) {
        const [dr, sideA, sideB] = getCurvedLinePosition(d);
        // generate svg path
        return "M" + d.source.x + "," + d.source.y +
            "A" + dr + "," + dr + " 0 0 " + sideA + "," + d.target.x + "," + d.target.y +
            "A" + dr + "," + dr + " 0 0 " + sideB + "," + d.source.x + "," + d.source.y;
    });

    node.attr("transform", function (d) { return "translate(" + d.x + ", " + d.y + ")"; });

    edgepaths.attr('d', function (d) {
        return 'M ' + d.source.x + ' ' + d.source.y + ' L ' + d.target.x + ' ' + d.target.y;
    });

    linkPerp
        .attr("x1", function (d) { return getPerpLine(d)[0] })
        .attr("y1", function (d) { return getPerpLine(d)[1] })
        .attr("x2", function (d) { return getPerpLine(d)[2] })
        .attr("y2", function (d) { return getPerpLine(d)[3] });


    edgelabelswrap.attr('transform', function (d) {
        // Rotate when flipped
        if (d.target.x < d.source.x) {
            var bbox = this.getBBox();

            rx = bbox.x + bbox.width / 2;
            ry = bbox.y + bbox.height / 2;
            return 'rotate(180 ' + rx + ' ' + ry + ')';
        }
        else {
            return 'rotate(0)';
        }
    });


    edgelabels.attr('transform', function (d) {
        const [x, y] = getArcLineCentre(d)
        const [dr, sideA, sideB] = getCurvedLinePosition(d);

        if (sideA === 0) {
            if (d.target.x < d.source.x) {
                if (d.target.y < d.source.y) {
                    // top left
                    return 'translate(-' + x + ',' + y + ')';
                } else {
                    // bottom left
                    return 'translate(' + x + ',' + y + ')';
                    // correc
                }
            }
            else {
                if (d.target.y < d.source.y) {
                    // top right
                    return 'translate(-' + x + ',-' + y + ')';
                } else {
                    return 'translate(' + x + ',-' + y + ')';
                    // bottom right
                }
            }

        } else {

            if (d.target.x < d.source.x) {
                if (d.target.y < d.source.y) {
                    // top left
                    return 'translate(' + x + ',-' + y + ')';
                } else {
                    // bottom left
                    return 'translate(-' + x + ',-' + y + ')';
                    // correc
                }
            }
            else {
                if (d.target.y < d.source.y) {
                    // top right
                    return 'translate(' + x + ',' + y + ')';
                } else {
                    return 'translate(-' + x + ',' + y + ')';
                    // bottom right
                }
            }
        }
    });
}

function dragstarted(d) {
    if (!d3.event.active) simulation.alphaTarget(0.02).restart()
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(d) {
    d.fx = d3.event.x;
    d.fy = d3.event.y;
}

//    function dragended(d) {
//        if (!d3.event.active) simulation.alphaTarget(0);
//        d.fx = undefined;
//        d.fy = undefined;
//    }
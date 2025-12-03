// Tab switching functionality
document.addEventListener('DOMContentLoaded', function() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and panes
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));

            // Add active class to clicked button and corresponding pane
            button.classList.add('active');
            const tabId = button.dataset.tab;
            document.getElementById(tabId).classList.add('active');

            // Trigger resize event to ensure visualizations render correctly
            window.dispatchEvent(new Event('resize'));
            // notify Tab1 charts to re-render (network/time-series moved into Tab1)
            window.dispatchEvent(new Event('render-tab1-charts'));
        });
    });

    // Initialize SVG containers with basic dimensions
    const svgContainers = document.querySelectorAll('svg');
    svgContainers.forEach(svg => {
        // Set viewBox for better responsiveness
        svg.setAttribute('viewBox', '0 0 800 400');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    });

    // =====================================================================
    // Correlation heatmap dashboard for tab1
    // =====================================================================
    function initializeVisualizations() {
        const dataPath = 'synthetic_coffee_health_10000.csv';
        const outcomes = ['Sleep_Hours', 'BMI', 'Heart_Rate', 'Stress_Level'];
        const ageBins = ['<30', '30-44', '45-59', '60+'];

        // Tooltip
        const tooltip = d3.select('body').append('div')
            .attr('class', 'd3-tooltip');

        // Populate selects and load data
        d3.csv(dataPath, d3.autoType).then(raw => {
            // AutoType will try to parse numbers; but Stress_Level may be categorical (Low/Medium/High)
            const stressMap = { 'Low': 1, 'Medium': 2, 'High': 3 };

            const data = raw.map(d => {
                return {
                    ID: d.ID,
                    Age: +d.Age,
                    Gender: d.Gender,
                    Country: d.Country,
                    Coffee_Intake: +d.Coffee_Intake,
                    Caffeine_mg: +d.Caffeine_mg,
                    Sleep_Hours: +d.Sleep_Hours,
                    Sleep_Quality: d.Sleep_Quality,
                    BMI: +d.BMI,
                    Heart_Rate: +d.Heart_Rate,
                    Stress_Level: (typeof d.Stress_Level === 'number') ? +d.Stress_Level : (stressMap[d.Stress_Level] || NaN),
                    Physical_Activity_Hours: +d.Physical_Activity_Hours,
                    Health_Issues: d.Health_Issues,
                    Occupation: d.Occupation,
                    Smoking: d.Smoking,
                    Alcohol_Consumption: d.Alcohol_Consumption
                };
            }).filter(d => !isNaN(d.Coffee_Intake));

            // Add ageGroup
            data.forEach(d => {
                if (d.Age < 30) d.ageGroup = '<30';
                else if (d.Age < 45) d.ageGroup = '30-44';
                else if (d.Age < 60) d.ageGroup = '45-59';
                else d.ageGroup = '60+';
            });

            // Unique lists
            const countries = Array.from(new Set(data.map(d => d.Country))).sort();
            const occupations = Array.from(new Set(data.map(d => d.Occupation))).sort();

            // Expose data globally for other tabs
            window.appData = data;

            // Populate country buttons (top of Tab1) with an 'All' quick-toggle and individual country items
            const countryButtons = d3.select('#country-buttons');
            // All button
            countryButtons.append('button').attr('id', 'country-all-btn').attr('class', 'country-btn').attr('type', 'button').text('All')
                .on('click', function() {
                    const btn = d3.select(this);
                    const active = btn.classed('active');
                    if (!active) {
                        // activate all country items
                        countryButtons.selectAll('button.country-item').classed('active', true);
                        btn.classed('active', true);
                    } else {
                        // deactivate all
                        countryButtons.selectAll('button.country-item').classed('active', false);
                        btn.classed('active', false);
                    }
                    renderAll();
                });

            // individual country buttons
            countryButtons.selectAll('button.country-item')
                .data(countries)
                .enter().append('button')
                .attr('class', 'country-btn country-item')
                .attr('type', 'button')
                .text(d => d)
                .on('click', function(event, d) {
                    const btn = d3.select(this);
                    const active = btn.classed('active');
                    btn.classed('active', !active);
                    // update All button if needed
                    const total = countries.length;
                    const activeCount = countryButtons.selectAll('button.country-item').filter(function() { return d3.select(this).classed('active'); }).size();
                    countryButtons.select('#country-all-btn').classed('active', activeCount === total);
                    renderAll();
                });

            // Populate occupation select
            const occSelect = d3.select('#occupation-select');
            occSelect.selectAll('option.occ')
                .data(occupations)
                .enter().append('option')
                .attr('class', 'occ')
                .attr('value', d => d)
                .text(d => d);

            // Default: activate top 6 countries by count
            const countryCounts = d3.rollups(data, v => v.length, d => d.Country)
                .sort((a, b) => d3.descending(a[1], b[1]));
            const defaultCountries = countryCounts.slice(0, 6).map(d => d[0]);
            countryButtons.selectAll('button.country-item').classed('active', d => defaultCountries.includes(d));
            // set All button active if all countries active
            const topActiveCount = countryButtons.selectAll('button.country-item').filter(function() { return d3.select(this).classed('active'); }).size();
            countryButtons.select('#country-all-btn').classed('active', topActiveCount === countries.length);

            // Attach listeners to controls (country buttons have click handlers)
            d3.selectAll('#gender-select, #occupation-select, .age-groups input, #tab1-outcome-select')
                .on('change', renderAll);

            // Initial render
            renderAll();

            // Initialize tab2 visualizations (distribution explorer)
            initTab2(data, tooltip);
            // Initialize tab3 visualizations (lifestyle network & cohort explorer)
            initTab3(data, tooltip);

            // Render for each outcome into the corresponding svg
            function renderAll() {
                // collect active countries from buttons; if none active, treat as all (no filter)
                let selectedCountries = Array.from(document.querySelectorAll('#country-buttons .country-btn.active')).map(b => b.textContent);
                if (!selectedCountries || selectedCountries.length === 0) selectedCountries = countries.slice();
                const gender = document.getElementById('gender-select').value;
                const occ = document.getElementById('occupation-select').value;
                const selectedAges = Array.from(document.querySelectorAll('.age-groups input:checked')).map(i => i.value);

                // Filter data according to selections
                let filtered = data.filter(d => selectedCountries.includes(d.Country));
                if (gender && gender !== 'All') filtered = filtered.filter(d => d.Gender === gender);
                if (occ && occ !== 'All') filtered = filtered.filter(d => d.Occupation === occ);
                if (selectedAges.length) filtered = filtered.filter(d => selectedAges.includes(d.ageGroup));

                // Use selected Health Outcome to render a single correlation heatmap into #viz1-1
                const rowCountries = selectedCountries;
                const selectedOutcome = (d3.select('#tab1-outcome-select').node() || {}).value || 'Sleep_Hours';
                // render into viz1-1
                renderHeatmap('#viz1-1', filtered, rowCountries, ageBins, 'Coffee_Intake', selectedOutcome);
                // notify network/time-series to (re)render so they persist after filter changes
                window.dispatchEvent(new Event('render-tab1-charts'));
            }

            // Heatmap renderer
            function renderHeatmap(svgSelector, dataSubset, countriesList, cols, xField, yField) {
                const svg = d3.select(svgSelector);
                svg.selectAll('*').remove();
                const margin = { top: 30, right: 10, bottom: 40, left: 120 };
                const width = 800 - margin.left - margin.right;
                const height = 400 - margin.top - margin.bottom;

                const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

                // Prepare matrix values
                const matrix = [];
                countriesList.forEach((country, r) => {
                    cols.forEach((ageGroup, c) => {
                        const cell = dataSubset.filter(d => d.Country === country && d.ageGroup === ageGroup && !isNaN(d[yField]) && !isNaN(d[xField]));
                        const xvals = cell.map(d => +d[xField]);
                        const yvals = cell.map(d => +d[yField]);
                        const corr = (xvals.length >= 6) ? pearson(xvals, yvals) : NaN;
                        matrix.push({ country, ageGroup, r, c, corr, n: xvals.length });
                    });
                });

                // Scales
                const xScale = d3.scaleBand().domain(cols).range([0, width]).padding(0.05);
                const yScale = d3.scaleBand().domain(countriesList).range([0, height]).padding(0.05);

                const color = d3.scaleSequential()
                    .domain([1, -1]) // reversed for RdBu style
                    .interpolator(d3.interpolateRdBu);

                // Title
                svg.append('text')
                    .attr('class', 'viz-title')
                    .attr('x', margin.left)
                    .attr('y', 18)
                    .text(`${yField} vs Coffee_Intake — correlation heatmap`);

                // Cells
                g.selectAll('rect.cell')
                    .data(matrix)
                    .enter().append('rect')
                    .attr('class', 'cell')
                    .attr('x', d => xScale(d.ageGroup))
                    .attr('y', d => yScale(d.country))
                    .attr('width', xScale.bandwidth())
                    .attr('height', yScale.bandwidth())
                    .attr('fill', d => isNaN(d.corr) ? '#eee' : color(d.corr))
                    .attr('stroke', '#fff')
                    .on('mousemove', function(event, d) {
                        const [mx, my] = d3.pointer(event);
                        tooltip.style('left', (event.pageX + 12) + 'px')
                            .style('top', (event.pageY + 12) + 'px')
                            .style('opacity', 1)
                            .html(`<strong>${d.country} / ${d.ageGroup}</strong><br/>n=${d.n}<br/>corr=${isNaN(d.corr)?'n/a':d.corr.toFixed(3)}`);
                    })
                    .on('mouseout', () => tooltip.style('opacity', 0));

                // Axes labels
                const xAxis = d3.axisBottom(xScale);
                const yAxis = d3.axisLeft(yScale).tickSize(0);

                g.append('g')
                    .attr('transform', `translate(0, ${height})`)
                    .call(xAxis)
                    .selectAll('text')
                    .attr('dy', '1em');

                g.append('g')
                    .call(yAxis)
                    .selectAll('text')
                    .style('font-size', '11px');

                // Color legend (simple)
                const legendW = 150,
                    legendH = 8;
                const legendX = margin.left + width - legendW;
                const legendY = margin.top - 10;
                const defs = svg.append('defs');
                const gradId = `grad-${svgSelector.replace('#','')}`;
                const gradient = defs.append('linearGradient').attr('id', gradId).attr('x1', '0%').attr('x2', '100%');
                // create stops from -1 to 1
                const stops = d3.range(-1, 1.01, 0.25).map(v => ({ offset: ((v + 1) / 2 * 100) + '%', color: color(v) }));
                gradient.selectAll('stop').data(stops).enter().append('stop')
                    .attr('offset', d => d.offset).attr('stop-color', d => d.color);

                svg.append('rect')
                    .attr('x', legendX).attr('y', 6)
                    .attr('width', legendW).attr('height', legendH)
                    .style('fill', `url(#${gradId})`);

                svg.append('text').attr('x', legendX).attr('y', 4).attr('text-anchor', 'start').style('font-size', '10px').text('corr: -1');
                svg.append('text').attr('x', legendX + legendW).attr('y', 4).attr('text-anchor', 'end').style('font-size', '10px').text('1');
            }

            // Pearson correlation
            function pearson(x, y) {
                const n = x.length;
                if (n === 0) return NaN;
                const meanX = d3.mean(x);
                const meanY = d3.mean(y);
                let num = 0,
                    denX = 0,
                    denY = 0;
                for (let i = 0; i < n; i++) {
                    const dx = x[i] - meanX;
                    const dy = y[i] - meanY;
                    num += dx * dy;
                    denX += dx * dx;
                    denY += dy * dy;
                }
                const denom = Math.sqrt(denX * denY);
                return denom === 0 ? NaN : num / denom;
            }

            // -------------------------
            // Tab2: Distribution Explorer
            // -------------------------
            function initTab2(data, tooltip) {
                // selected country from choropleth (null = all)
                let selectedMapCountry = null;

                // color mapping for countries (categorical palette)
                const countryPalette = (n) => {
                    const base = (d3.schemeTableau10 || []).concat(d3.schemeSet3 || []);
                    const out = [];
                    for (let i = 0; i < n; i++) out.push(base[i % base.length]);
                    return out;
                };
                const countryColor = d3.scaleOrdinal().domain(countries).range(countryPalette(countries.length));
                // Controls
                const outcomeSelect = d3.select('#outcome-select');
                const demographicSelect = d3.select('#demographic-select');
                const coffeeLevelFilter = d3.select('#coffee-level-filter');

                // Listeners
                outcomeSelect.on('change', () => renderTab2());
                demographicSelect.on('change', () => renderTab2());
                coffeeLevelFilter.on('change', () => renderTab2());

                // initial render
                renderTab2();

                function renderTab2() {
                    const outcome = outcomeSelect.node().value;
                    const demographic = demographicSelect.node().value;
                    const levelFilter = coffeeLevelFilter.node().value; // All / Low / Medium / High

                    // compute coffee intake levels with global quantiles (default)
                    const ci = data.map(d => +d.Coffee_Intake).filter(v => !isNaN(v));
                    const q1 = d3.quantile(ci, 0.33);
                    const q2 = d3.quantile(ci, 0.66);
                    const thresholds = [q1, q2];

                    // Assign coffee level to each record
                    data.forEach(d => {
                        const v = +d.Coffee_Intake;
                        if (isNaN(v)) d.coffeeLevel = 'Unknown';
                        else if (v <= thresholds[0]) d.coffeeLevel = 'Low';
                        else if (v <= thresholds[1]) d.coffeeLevel = 'Medium';
                        else d.coffeeLevel = 'High';
                    });

                    // Render components: choropleth (with tooltip distribution), scatter matrix, and boxplot
                    renderChoropleth(outcome, levelFilter);
                    renderScatterMatrix(outcome);
                    renderBoxplot('Caffeine_mg', demographic, '#viz2-4');
                }

                // Stacked / grouped bar chart showing distribution of selected outcome by coffee level
                // (stacked chart removed per request) -- distribution will be shown in map tooltip

                // Choropleth map: average coffee intake per country
                function renderChoropleth(outcome, levelFilter) {
                    const svg = d3.select('#viz2-2');
                    svg.selectAll('*').remove();
                    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
                    const width = 800 - margin.left - margin.right;
                    const height = 400 - margin.top - margin.bottom;
                    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

                    // aggregate avg coffee by country
                    const avgByCountry = Object.fromEntries(d3.rollups(data, v => d3.mean(v, d => +d.Coffee_Intake), d => d.Country));

                    // fetch world geojson (has `name` property)
                    const geoUrl = 'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson';
                    d3.json(geoUrl).then(world => {
                        const projection = d3.geoMercator().fitSize([width, height], world);
                        const path = d3.geoPath().projection(projection);

                        const values = Object.values(avgByCountry).filter(v => !isNaN(v));
                        const color = d3.scaleSequential().domain([d3.min(values), d3.max(values)]).interpolator(d3.interpolateTurbo);

                        const paths = g.selectAll('path')
                            .data(world.features)
                            .enter().append('path')
                            .attr('d', path)
                            .attr('fill', d => {
                                const name = d.properties.name;
                                const v = avgByCountry[name];
                                return (v == null || isNaN(v)) ? '#eee' : color(v);
                            })
                            .attr('stroke', '#999')
                            .style('cursor', 'pointer')
                            .on('mousemove', function(event, d) {
                                const name = d.properties.name;
                                // build distribution for this country using selected outcome and coffee-level filter
                                const outcomeNow = outcome || (d3.select('#outcome-select').node() || {}).value || 'Sleep_Hours';
                                const levelFilterNow = levelFilter || (d3.select('#coffee-level-filter').node() || {}).value || 'All';
                                let rows = data.filter(r => r.Country === name && !isNaN(+r[outcomeNow]));
                                if (levelFilterNow && levelFilterNow !== 'All') rows = rows.filter(r => r.coffeeLevel === levelFilterNow);

                                // prepare values
                                const vals = rows.map(r => +r[outcomeNow]).filter(v => !isNaN(v));

                                // render tooltip with embedded chart
                                tooltip.style('left', (event.pageX + 12) + 'px')
                                    .style('top', (event.pageY + 12) + 'px')
                                    .style('opacity', 1);

                                if (vals.length === 0) {
                                    tooltip.html(`<div class="chart-wrap"><strong>${name}</strong><div>No data for selection</div></div>`);
                                    return;
                                }

                                // create container and svg
                                tooltip.html('');
                                const cw = tooltip.append('div').attr('class', 'chart-wrap');
                                cw.append('div').style('font-weight', '700').style('margin-bottom', '6px').text(`${name} — ${outcomeNow} distribution (${levelFilterNow})`);
                                const tw = 300,
                                    th = 180; // tooltip chart size
                                const svgTip = cw.append('svg').attr('width', tw).attr('height', th);
                                drawHistogramInSVG(svgTip, vals, outcomeNow, tw, th);
                                d3.select(this).classed('country-hover', true);
                            })
                            .on('mouseout', function() {
                                tooltip.style('opacity', 0);
                                d3.select(this).classed('country-hover', false);
                            })
                            .on('click', function(event, d) {
                                const name = d.properties.name;
                                // toggle selection
                                if (selectedMapCountry === name) selectedMapCountry = null;
                                else selectedMapCountry = name;

                                // update selected class on paths
                                paths.classed('country-selected', f => f.properties && f.properties.name === selectedMapCountry);

                                // re-render dependent charts
                                renderScatterMatrix(outcome);
                                renderBoxplot('Caffeine_mg', demographicSelect.node().value, '#viz2-4');
                            });

                        // zoom
                        svg.call(d3.zoom().on('zoom', (event) => { g.attr('transform', event.transform); }));
                        svg.append('text').attr('class', 'viz-title').attr('x', margin.left).attr('y', 14).text('Distribution effect of Coffee Intake on Health Outcomes by Country');
                    }).catch(err => {
                        console.warn('Failed to load map geojson', err);
                    });
                }

                // Boxplot renderer for a numeric field grouped by a factor
                function renderBoxplot(field, groupBy, selector) {
                    const svg = d3.select(selector);
                    svg.selectAll('*').remove();
                    const margin = { top: 40, right: 20, bottom: 120, left: 60 };
                    const width = 800 - margin.left - margin.right;
                    const height = 400 - margin.top - margin.bottom;
                    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

                    // apply country filter if any
                    const filteredData = selectedMapCountry ? data.filter(d => d.Country === selectedMapCountry) : data;

                    // group
                    let groups = Array.from(new Set(filteredData.map(d => d[groupBy]))).filter(g => g != null);
                    // If grouping by Age (numeric), keep numeric values and sort numerically so comparisons match the original data types
                    if (String(groupBy).toLowerCase().includes('age')) {
                        groups = groups.map(g => +g).filter(v => !isNaN(v)).sort((a, b) => a - b);
                    } else {
                        // ensure string sorting for non-numeric groups
                        groups = groups.map(g => String(g)).sort();
                    }
                    groups = groups.slice(0, 20); // limit to 20 groups to keep readable
                    const stats = groups.map(gp => {
                        const vals = filteredData.filter(d => d[groupBy] === gp).map(d => +d[field]).filter(v => !isNaN(v));
                        vals.sort(d3.ascending);
                        const q1 = d3.quantile(vals, 0.25);
                        const q2 = d3.quantile(vals, 0.5);
                        const q3 = d3.quantile(vals, 0.75);
                        const iqr = q3 - q1;
                        const min = d3.max([d3.min(vals), q1 - 1.5 * iqr]);
                        const max = d3.min([d3.max(vals), q3 + 1.5 * iqr]);
                        return { group: gp, q1, q2, q3, min, max, n: vals.length };
                    });

                    const x = d3.scaleBand().domain(groups).range([0, width]).padding(0.3);
                    const allVals = filteredData.map(d => +d[field]).filter(v => !isNaN(v));
                    const y = d3.scaleLinear().domain([d3.min(allVals), d3.max(allVals)]).nice().range([height, 0]);

                    // boxes
                    g.selectAll('g.box').data(stats).enter().append('g').attr('transform', d => `translate(${x(d.group)},0)`).each(function(d) {
                        const gg = d3.select(this);
                        gg.append('line').attr('x1', x.bandwidth() / 2).attr('x2', x.bandwidth() / 2).attr('y1', y(d.min)).attr('y2', y(d.max)).attr('stroke', '#000');
                        gg.append('rect').attr('x', 0).attr('y', y(d.q3)).attr('width', x.bandwidth()).attr('height', Math.max(1, y(d.q1) - y(d.q3))).attr('fill', '#9ecae1').attr('stroke', '#000');
                        gg.append('line').attr('x1', 0).attr('x2', x.bandwidth()).attr('y1', y(d.q2)).attr('y2', y(d.q2)).attr('stroke', '#000');
                    });

                    g.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x)).selectAll('text').attr('transform', 'rotate(-60)').style('text-anchor', 'end');
                    g.append('g').call(d3.axisLeft(y));
                    const countryLabel = selectedMapCountry || 'All';
                    svg.append('text').attr('class', 'viz-title').attr('x', margin.left).attr('y', 18).text(`${field} distribution by ${groupBy} (${countryLabel})`);
                }

                // Draw a small histogram into an existing tooltip SVG selection
                function drawHistogramInSVG(svgSel, values, label, tw, th) {
                    // svgSel is a d3 selection of an svg element
                    const margin = { top: 10, right: 8, bottom: 30, left: 36 };
                    const width = tw - margin.left - margin.right;
                    const height = th - margin.top - margin.bottom;
                    svgSel.selectAll('*').remove();
                    const g = svgSel.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

                    const x = d3.scaleLinear().domain(d3.extent(values)).nice().range([0, width]);
                    const bins = d3.bin().domain(x.domain()).thresholds(12)(values);
                    const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length)]).nice().range([height, 0]);

                    // bars
                    g.selectAll('rect').data(bins).enter().append('rect')
                        .attr('x', d => x(d.x0) + 1)
                        .attr('y', d => y(d.length))
                        .attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 1))
                        .attr('height', d => Math.max(0, height - y(d.length)))
                        .attr('fill', '#3b82f6');

                    // axes
                    const xAxis = d3.axisBottom(x).ticks(6);
                    const yAxis = d3.axisLeft(y).ticks(4);

                    g.append('g').attr('transform', `translate(0,${height})`).call(xAxis);
                    g.append('g').call(yAxis);

                    // labels
                    svgSel.append('text').attr('x', tw / 2).attr('y', th - 2).attr('text-anchor', 'middle').style('font-size', '11px').text(label);
                    svgSel.append('text').attr('transform', 'rotate(-90)').attr('x', -th / 2).attr('y', 10).attr('text-anchor', 'middle').style('font-size', '11px').text('count');
                }

                // Single scatter plot (Coffee_Intake vs selected health outcome) in viz2-3
                function renderScatterMatrix(outcome) {
                    const svg = d3.select('#viz2-3');
                    svg.selectAll('*').remove();
                    const margin = { top: 30, right: 20, bottom: 50, left: 60 };
                    const width = 800 - margin.left - margin.right;
                    const height = 400 - margin.top - margin.bottom;
                    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

                    const yField = outcome || (d3.select('#outcome-select').node() || {}).value || 'Sleep_Hours';

                    // data filtered by selectedMapCountry if present
                    const plotData = selectedMapCountry ? data.filter(d => d.Country === selectedMapCountry) : data;
                    const sub = plotData.filter(d => !isNaN(+d.Coffee_Intake) && !isNaN(+d[yField]));

                    // scales
                    const x = d3.scaleLinear().domain(d3.extent(sub, d => +d.Coffee_Intake)).nice().range([0, width]);
                    const y = d3.scaleLinear().domain(d3.extent(sub, d => +d[yField])).nice().range([height, 0]);

                    // Title with selected country
                    const countryLabel = selectedMapCountry || 'All';
                    svg.append('text').attr('class', 'viz-title').attr('x', margin.left + width / 2).attr('y', 18).attr('text-anchor', 'middle').text(`Anomaly Annotation Scatter Plot (${countryLabel})`);

                    // axes
                    g.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x).ticks(8));
                    g.append('g').call(d3.axisLeft(y).ticks(6));
                    svg.append('text').attr('class', 'axis-title').attr('x', margin.left + width / 2).attr('y', margin.top + height + 40).attr('text-anchor', 'middle').text('Coffee Intake');
                    svg.append('text').attr('class', 'axis-title').attr('transform', 'rotate(-90)').attr('x', -(margin.top + height / 2)).attr('y', 14).attr('text-anchor', 'middle').text(yField);

                    // simple linear regression for residuals -> outlier detection
                    let slope = 0,
                        intercept = 0,
                        residuals = [];
                    if (sub.length > 2) {
                        const xs = sub.map(d => +d.Coffee_Intake),
                            ys = sub.map(d => +d[yField]);
                        const meanX = d3.mean(xs),
                            meanY = d3.mean(ys);
                        const num = d3.sum(xs.map((v, i) => (v - meanX) * (ys[i] - meanY)));
                        const den = d3.sum(xs.map(v => (v - meanX) * (v - meanX)));
                        slope = den === 0 ? 0 : num / den;
                        intercept = meanY - slope * meanX;
                        residuals = sub.map(d => +d[yField] - (slope * +d.Coffee_Intake + intercept));
                    }

                    const sdRes = residuals.length > 1 ? d3.deviation(residuals) : 0;

                    // draw points
                    const star = d3.symbol().type(d3.symbolStar).size(140);

                    g.selectAll('path.pt').data(sub).enter().append('path')
                        .attr('class', 'scatter-point')
                        .attr('d', d => {
                            const idx = sub.indexOf(d);
                            const isOut = residuals.length ? Math.abs(residuals[idx]) > 3 * (sdRes || 1) : false;
                            return isOut ? star() : d3.symbol().type(d3.symbolCircle).size(28)();
                        })
                        .attr('fill', d => countryColor(d.Country) || '#666')
                        .attr('stroke', '#222')
                        .attr('stroke-width', d => {
                            const idx = sub.indexOf(d);
                            const isOut = residuals.length ? Math.abs(residuals[idx]) > 3 * (sdRes || 1) : false;
                            return isOut ? 1.2 : 0.6;
                        })
                        .attr('transform', d => `translate(${x(+d.Coffee_Intake)},${y(+d[yField])})`)
                        .on('mouseover', function(event, d) {
                            // highlight hovered point
                            g.selectAll('.scatter-point').classed('selected', p => p === d);
                            // enlarge hovered point by setting transform with scale
                            d3.select(this).attr('transform', `translate(${x(+d.Coffee_Intake)},${y(+d[yField])}) scale(1.25)`);
                            // show tooltip
                            tooltip.style('left', (event.pageX + 10) + 'px').style('top', (event.pageY + 10) + 'px').style('opacity', 1)
                                .html(`<div class="chart-wrap"><strong>ID ${d.ID}</strong><div>Country: ${d.Country}<br/>Coffee: ${d.Coffee_Intake}<br/>${yField}: ${d[yField]}</div></div>`);
                        })
                        .on('mouseout', function(event, d) {
                            // remove highlight
                            g.selectAll('.scatter-point').classed('selected', false);
                            // reset transform
                            d3.select(this).attr('transform', `translate(${x(+d.Coffee_Intake)},${y(+d[yField])})`);
                            // hide tooltip
                            tooltip.style('opacity', 0);
                        });

                    // regression line (optional subtle)
                    if (sub.length > 2) {
                        const xLine = d3.extent(sub, d => +d.Coffee_Intake);
                        const yLine = xLine.map(xv => slope * xv + intercept);
                        g.append('line').attr('x1', x(xLine[0])).attr('y1', y(yLine[0])).attr('x2', x(xLine[1])).attr('y2', y(yLine[1])).attr('stroke', '#444').attr('stroke-dasharray', '4 3').attr('opacity', 0.7);
                    }
                }
            }

            // -------------------------
            // Tab3: Lifestyle Trend Network & Cohort Explorer
            // -------------------------
            function initTab3(data, tooltip) {
                // controls
                const varSelect = d3.select('#ts-variable-select');
                const occSelectTS = d3.select('#ts-occupation-select');

                // populate occupation select
                occSelectTS.selectAll('option.occ-ts').data(['All'].concat(occupations)).enter().append('option').attr('class', 'occ-ts').attr('value', d => d).text(d => d);

                varSelect.on('change', renderTab3);
                occSelectTS.on('change', renderTab3);
                // link threshold control
                const linkThreshold = d3.select('#ts-link-threshold');
                const linkThresholdVal = d3.select('#ts-link-threshold-val');
                linkThreshold.on('input', function() {
                    linkThresholdVal.text(parseFloat(this.value).toFixed(2));
                    renderTab3();
                });

                // initial render
                renderTab3();
                // re-render Tab1 charts when Tab1 becomes visible (triggered by tab switch)
                window.addEventListener('render-tab1-charts', renderTab3);

                function renderTab3() {
                    const variable = varSelect.node().value;
                    const occ = occSelectTS.node().value;
                    const filtered = (occ && occ !== 'All') ? data.filter(d => d.Occupation === occ) : data;

                    const thr = +linkThreshold.node().value;
                    // render network and cohort into Tab1 slots (#viz1-2 and #viz1-3)
                    renderNetwork(filtered, '#viz1-2', thr);
                    renderTimeSeries(filtered, variable, '#viz1-3');
                }

                // network diagram: nodes = variables; edges = correlations
                function renderNetwork(dataset, selector, threshold = 0.2) {
                    const svg = d3.select(selector);
                    svg.selectAll('*').remove();
                    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
                    const width = 800 - margin.left - margin.right;
                    const height = 400 - margin.top - margin.bottom;
                    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

                    // Title
                    svg.append('text').attr('class', 'viz-title').attr('x', margin.left + width / 2).attr('y', 14).attr('text-anchor', 'middle').text('Correlation Network (relationships between lifestyle vs Coffee_Intake)');

                    const vars = ['Coffee_Intake', 'Caffeine_mg', 'Sleep_Hours', 'BMI', 'Heart_Rate', 'Stress_Level', 'Physical_Activity_Hours'];

                    // compute correlations between vars
                    const pairs = [];
                    const nodes = vars.map(v => ({ id: v }));
                    vars.forEach((v1, i) => {
                        vars.slice(i + 1).forEach(v2 => {
                            const a = dataset.map(d => +d[v1]).filter(v => !isNaN(v));
                            const b = dataset.map(d => +d[v2]).filter(v => !isNaN(v));
                            // build paired arrays
                            const paired = dataset.map(d => ({ x: +d[v1], y: +d[v2] })).filter(p => !isNaN(p.x) && !isNaN(p.y));
                            const corr = (paired.length >= 6) ? pearson(paired.map(p => p.x), paired.map(p => p.y)) : 0;
                            pairs.push({ source: v1, target: v2, corr });
                        });
                    });

                    // node size = abs(correlation with Coffee_Intake)
                    const corrWithCoffee = {};
                    vars.forEach(v => {
                        if (v === 'Coffee_Intake') corrWithCoffee[v] = 1;
                        else {
                            const paired = dataset.map(d => ({ x: +d.Coffee_Intake, y: +d[v] })).filter(p => !isNaN(p.x) && !isNaN(p.y));
                            corrWithCoffee[v] = (paired.length >= 6) ? Math.abs(pearson(paired.map(p => p.x), paired.map(p => p.y))) : 0.01;
                        }
                    });

                    // compute max observed absolute correlation to scale node sizes/colors appropriately
                    const maxCorrObserved = d3.max(Object.values(corrWithCoffee));
                    const sizeScale = d3.scaleSqrt().domain([0, Math.max(0.01, maxCorrObserved || 0.01)]).range([8, 34]);
                    const linkScale = d3.scaleLinear().domain([0, Math.max(0.01, maxCorrObserved || 0.01)]).range([0.8, 8]);
                    // color nodes by absolute correlation magnitude (0 -> low, max -> intense)
                    const roseColors = ['#fff5f7', '#ffd6e0', '#ff9fcf', '#ff7fb3', '#ff4d9e', '#e11d74', '#7b1146'];
                    const roseInterp = d3.interpolateRgbBasis(roseColors);
                    const nodeColor = d3.scaleSequential().domain([0, Math.max(0.01, maxCorrObserved || 0.01)]).interpolator(roseInterp);
                    const linkColor = d3.scaleLinear().domain([-1, 0, 1]).range(['#d73027', '#999', '#1a9850']);

                    const links = pairs.filter(p => Math.abs(p.corr) > 0.05).map(p => Object.assign({}, p, { value: Math.abs(p.corr) }));

                    // force simulation
                    const simulation = d3.forceSimulation(nodes)
                        .force('link', d3.forceLink(links).id(d => d.id).distance(d => 120 - 80 * d.value))
                        .force('charge', d3.forceManyBody().strength(-200))
                        .force('center', d3.forceCenter(width / 2, height / 2));

                    const link = g.append('g').attr('class', 'links').selectAll('line').data(links).enter().append('line')
                        .attr('stroke-width', d => Math.max(0.6, linkScale(d.value))).attr('opacity', 0.95)
                        .attr('stroke', d => linkColor(d.corr)).attr('stroke-linecap', 'round');

                    const node = g.append('g').selectAll('g.node').data(nodes).enter().append('g').attr('class', 'node').call(d3.drag()
                        .on('start', (event, d) => {
                            if (!event.active) simulation.alphaTarget(0.3).restart();
                            d.fx = d.x;
                            d.fy = d.y;
                        })
                        .on('drag', (event, d) => {
                            d.fx = event.x;
                            d.fy = event.y;
                        })
                        .on('end', (event, d) => {
                            if (!event.active) simulation.alphaTarget(0);
                            d.fx = null;
                            d.fy = null;
                        }));

                    node.append('circle')
                        .attr('r', d => sizeScale(corrWithCoffee[d.id] || 0.01))
                        .attr('fill', d => nodeColor(corrWithCoffee[d.id] || 0.01))
                        .attr('stroke', '#222')
                        .attr('stroke-width', 1)
                        .attr('filter', 'url(#drop-shadow)')
                        .on('mouseover', function(event, d) {
                            const c = corrWithCoffee[d.id] || 0;
                            tooltip.style('left', (event.pageX + 12) + 'px').style('top', (event.pageY + 12) + 'px').style('opacity', 1)
                                .html(`<div class="chart-wrap"><strong>${d.id}</strong><div>abs(corr with Coffee): ${c.toFixed(3)}</div></div>`);
                        }).on('mouseout', () => tooltip.style('opacity', 0));

                    node.append('text').text(d => d.id).attr('x', 10).attr('y', 4).style('font-size', '11px');

                    link.append('title').text(d => `corr: ${d.corr.toFixed(2)}`);

                    // defs for drop shadow
                    const defs = svg.append('defs');
                    const filter = defs.append('filter').attr('id', 'drop-shadow').attr('height', '130%');
                    filter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 2).attr('result', 'blur');
                    filter.append('feOffset').attr('in', 'blur').attr('dx', 0).attr('dy', 1).attr('result', 'offsetBlur');
                    const feMerge = filter.append('feMerge');
                    feMerge.append('feMergeNode').attr('in', 'offsetBlur');
                    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

                    // build legend gradient using the same rose interpolator
                    const gradId = 'legend-rose';
                    const gradient = defs.append('linearGradient').attr('id', gradId).attr('x1', '0%').attr('x2', '100%');
                    const stops = 12;
                    d3.range(0, stops + 1).forEach(i => {
                        gradient.append('stop').attr('offset', `${(i / stops) * 100}%`).attr('stop-color', roseInterp(i / stops));
                    });

                    // draw colorbar legend near the bottom center of this svg
                    const legendW = 180,
                        legendH = 12;
                    const legendX = margin.left + (width - legendW) / 2;
                    const legendY = margin.top + height - legendH - 6;
                    const safeMax = Math.max(0.01, maxCorrObserved || 0.01);
                    const legendG = svg.append('g').attr('class', 'legend').attr('transform', `translate(${legendX},${legendY})`);
                    legendG.append('rect').attr('width', legendW).attr('height', legendH).attr('fill', `url(#${gradId})`).attr('stroke', '#ccc');
                    const legendScale = d3.scaleLinear().domain([0, safeMax]).range([0, legendW]);
                    const legendAxis = d3.axisBottom(legendScale).ticks(4).tickFormat(d3.format('.2f'));
                    legendG.append('g').attr('transform', `translate(0,${legendH})`).call(legendAxis).selectAll('text').style('font-size', '10px');
                    legendG.append('text').attr('x', legendW / 2).attr('y', -6).attr('text-anchor', 'middle').attr('class', 'viz-title').text('(Correlation with Coffee_Intake)');

                    simulation.on('tick', () => {
                        link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
                        node.attr('transform', d => `translate(${d.x},${d.y})`);
                    });
                }

                // Time-series across age groups (line chart) -- shows trend for selected variable; if occupation=All show multiple occupations
                function renderTimeSeries(dataset, variable, selector) {
                    const svg = d3.select(selector);
                    svg.selectAll('*').remove();
                    const margin = { top: 40, right: 120, bottom: 60, left: 60 };
                    const width = 800 - margin.left - margin.right;
                    const height = 400 - margin.top - margin.bottom;
                    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

                    // age group order (10-year bins from <20 to 70+)
                    const ageOrder = ['<20', '20-29', '30-39', '40-49', '50-59', '60-69', '70+'];

                    function binAge(age) {
                        if (age == null || isNaN(age)) return null;
                        const a = +age;
                        if (a < 20) return '<20';
                        if (a < 30) return '20-29';
                        if (a < 40) return '30-39';
                        if (a < 50) return '40-49';
                        if (a < 60) return '50-59';
                        if (a < 70) return '60-69';
                        return '70+';
                    }

                    // if occupation select is All, show multiple occupation lines (top 6 by count)
                    const occ = d3.select('#ts-occupation-select').node().value;
                    let series = [];
                    if (!occ || occ === 'All') {
                        const occCounts = d3.rollups(dataset, v => v.length, d => d.Occupation).sort((a, b) => d3.descending(a[1], b[1]));
                        const topOcc = occCounts.slice(0, 6).map(d => d[0]);
                        series = topOcc.map(o => ({ key: o, values: ageOrder.map(ag => ({ ageGroup: ag, v: d3.mean(dataset.filter(d => d.Occupation === o && binAge(d.Age) === ag).map(d => +d[variable]).filter(x => !isNaN(x))) || 0 })) }));
                    } else {
                        const vals = ageOrder.map(ag => ({ ageGroup: ag, v: d3.mean(dataset.filter(d => binAge(d.Age) === ag).map(d => +d[variable]).filter(x => !isNaN(x))) || 0 }));
                        series = [{ key: occ, values: vals }];
                    }

                    const x = d3.scalePoint().domain(ageOrder).range([0, width]);
                    const allVals = series.flatMap(s => s.values.map(v => v.v));
                    const y = d3.scaleLinear().domain([d3.min(allVals), d3.max(allVals)]).nice().range([height, 0]);

                    const color = d3.scaleOrdinal(d3.schemeTableau10).domain(series.map(s => s.key));

                    g.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x));
                    g.append('g').call(d3.axisLeft(y));

                    // overall title and axis titles
                    svg.append('text').attr('class', 'viz-title').attr('x', margin.left + width / 2).attr('y', 14).attr('text-anchor', 'middle').text(`${variable} Trend by Age Group`);
                    svg.append('text').attr('class', 'axis-title').attr('x', margin.left + width / 2).attr('y', margin.top + height + 44).attr('text-anchor', 'middle').text('Age Group');
                    svg.append('text').attr('class', 'axis-title').attr('transform', 'rotate(-90)').attr('x', -(margin.top + height / 2)).attr('y', 14).attr('text-anchor', 'middle').text(variable);

                    const line = d3.line().x(d => x(d.ageGroup)).y(d => y(d.v));

                    const grp = g.selectAll('.series').data(series).enter().append('g').attr('class', 'series');
                    grp.append('path')
                        .attr('class', 'series-line')
                        .attr('fill', 'none')
                        .attr('stroke', d => color(d.key))
                        .attr('stroke-width', 2.2)
                        .attr('d', d => line(d.values))
                        .style('cursor', 'pointer')
                        .on('mouseover', function(event, d) {
                            // Fade out all lines
                            g.selectAll('.series-line').transition().duration(200).style('opacity', 0.1);
                            // Highlight this line
                            d3.select(this).transition().duration(200).style('opacity', 1).attr('stroke-width', 3.5);
                            // Highlight circles of this series
                            d3.select(this.parentNode).selectAll('circle').transition().duration(200).attr('r', 5).style('opacity', 1);
                            // Fade other circles
                            g.selectAll('.series').filter(function() { return this !== d3.select(event.target).node().parentNode; })
                                .selectAll('circle').transition().duration(200).style('opacity', 0.1);
                        })
                        .on('mouseout', function() {
                            // Restore all lines
                            g.selectAll('.series-line').transition().duration(200).style('opacity', 1).attr('stroke-width', 2.2);
                            // Restore all circles
                            g.selectAll('circle').transition().duration(200).attr('r', 4).style('opacity', 1);
                        });

                    grp.each(function(seriesData) {
                        const seriesGroup = d3.select(this);
                        seriesGroup.selectAll('circle')
                            .data(seriesData.values)
                            .enter().append('circle')
                            .attr('cx', d => x(d.ageGroup))
                            .attr('cy', d => y(d.v))
                            .attr('r', 4)
                            .attr('fill', '#fff')
                            .attr('stroke', '#333')
                            .style('cursor', 'pointer')
                            .on('mouseover', function(event, d) {
                                // Fade out all lines except parent series
                                g.selectAll('.series-line').transition().duration(200).style('opacity', 0.1);
                                // Highlight parent line
                                d3.select(this.parentNode).select('.series-line').transition().duration(200).style('opacity', 1).attr('stroke-width', 3.5);
                                // Enlarge the circle
                                d3.select(this).transition().duration(150).attr('r', 6).attr('stroke-width', 2);
                                // Highlight circles of this series
                                d3.select(this.parentNode).selectAll('circle').transition().duration(200).style('opacity', 1);
                                // Fade other circles
                                g.selectAll('.series').filter(function() { return this !== d3.select(event.target).node().parentNode; })
                                    .selectAll('circle').transition().duration(200).style('opacity', 0.1);
                                // Show tooltip with value
                                tooltip.style('left', (event.pageX + 12) + 'px')
                                    .style('top', (event.pageY + 12) + 'px')
                                    .style('opacity', 1)
                                    .html(`<div class="chart-wrap"><strong>${seriesData.key}</strong><div>Age: ${d.ageGroup}<br/>${variable}: ${d.v.toFixed(2)}</div></div>`);
                            })
                            .on('mouseout', function() {
                                // Restore all lines
                                g.selectAll('.series-line').transition().duration(200).style('opacity', 1).attr('stroke-width', 2.2);
                                // Restore circle size
                                d3.select(this).transition().duration(150).attr('r', 4).attr('stroke-width', 1);
                                // Restore all circles
                                g.selectAll('circle').transition().duration(200).style('opacity', 1);
                                // Hide tooltip
                                tooltip.style('opacity', 0);
                            });
                    });

                    // legend
                    const legend = svg.append('g').attr('transform', `translate(${margin.left+width+10},${margin.top})`);
                    series.forEach((s, i) => {
                        const y0 = i * 20;
                        legend.append('rect').attr('x', 0).attr('y', y0).attr('width', 12).attr('height', 12).attr('fill', color(s.key));
                        legend.append('text').attr('x', 18).attr('y', y0 + 10).text(s.key).style('font-size', '12px');
                    });
                }
            }

        }).catch(err => {
            console.error('Failed to load CSV', err);
        });
    }

    // Call initialization
    initializeVisualizations();

    // Handle window resize — re-render simple approach: reinitialize when tab visible
    window.addEventListener('resize', () => {
        // small debounce
        if (this._resizeTO) clearTimeout(this._resizeTO);
        this._resizeTO = setTimeout(() => {
            // re-render only if tab1 active
            if (document.querySelector('#tab1').classList.contains('active')) {
                // trigger the control change to re-render
                const evt = new Event('change');
                document.querySelectorAll('#gender-select, #occupation-select').forEach(el => el.dispatchEvent(evt));
            }
        }, 200);
    });
});
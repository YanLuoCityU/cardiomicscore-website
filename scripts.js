const diseaseMap = {
    'cad': 'Coronary artery disease',
    'stroke': 'Stroke',
    'hf': 'Heart failure',
    'af': 'Atrial fibrillation',
    'pad': 'Peripheral artery disease',
    'vte': 'Venous thromboembolism'
};

// A mapping from variable ID to a user-friendly name for error messages
const friendlyVariableNames = {
    'age': 'Age (years)',
    'sbp': 'Systolic Blood Pressure',
    'dbp': 'Diastolic Blood Pressure',
    'height': 'Height',
    'weight': 'Weight',
    'waist_cir': 'Waist Circumference',
    'waist_hip_ratio': 'Waist-Hip Ratio',
    'bmi': 'Body Mass Index',
    'baso': 'Basophill Count',
    'eos': 'Eosinophill Count',
    'hct': 'Haematocrit',
    'hb': 'Haemoglobin',
    'lc': 'Lymphocyte Count',
    'mc': 'Monocyte Count',
    'nc': 'Neutrophill Count',
    'plt': 'Platelet Count',
    'wbc': 'Leukocyte Count'
};


// Global variables to hold data from CSV files
let baselineSurvivals = null;
let cIndexData = null;
let coefficients = null;
let panelScalerParams = null;
let percentiles = null; // Raw percentile data
let percentileMap = {}; // Processed data for efficient lookup


/**
 * A utility function to fetch and parse CSV data from a local file.
 * @param {string} filePath The path to the CSV file.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of objects representing the CSV data.
 */
async function loadCSVData(filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for file ${filePath}`);
        }
        const text = await response.text();
        const lines = text.trim().split('\n');
        const header = lines[0].split(',').map(h => h.trim());
        const data = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim());
            return header.reduce((obj, nextKey, index) => {
                obj[nextKey] = values[index];
                return obj;
            }, {});
        });
        console.log(`Successfully loaded ${filePath}`);
        return data;
    } catch (error) {
        console.error(`Error loading or parsing CSV file ${filePath}:`, error);
        document.getElementById('calculate-risk-button').disabled = true;
        document.getElementById('calculate-risk-button').textContent = 'Error: Data failed to load';
        return null;
    }
}

/**
 * Processes the raw percentile data into a nested object for fast lookups.
 */
function preparePercentilesData() {
    if (!percentiles) return;
    percentiles.forEach(row => {
        const { outcome, score, ...percentileValues } = row; 
        if (!percentileMap[outcome]) {
            percentileMap[outcome] = {};
        }
        if (!percentileMap[outcome][score]) { 
            percentileMap[outcome][score] = {};
        }
        
        for (const pKey in percentileValues) {
             if (pKey.startsWith('p')) {
                const percentileIndex = pKey.substring(1);
                percentileMap[outcome][score][percentileIndex] = parseFloat(percentileValues[pKey]);
             }
        }
    });
    console.log("Percentile data has been processed for efficient lookup.");
}


/**
 * Main initialization function that runs when the DOM is fully loaded.
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM fully loaded. Initializing application...');
    
    const calcButton = document.getElementById('calculate-risk-button');
    calcButton.disabled = true;
    calcButton.textContent = 'Loading data...';

    [
        baselineSurvivals,
        cIndexData,
        coefficients,
        panelScalerParams,
        percentiles
    ] = await Promise.all([
        loadCSVData('baseline_survivals.csv'),
        loadCSVData('cindex_final.csv'),
        loadCSVData('coefficients.csv'),
        loadCSVData('PANEL_scaler_params.csv'),
        loadCSVData('percentiles.csv') 
    ]);

    if (baselineSurvivals && cIndexData && coefficients && panelScalerParams && percentiles) {
        cIndexData = cIndexData.filter(row => row.metric === 'c_index');
        console.log(`Filtered cIndexData to ${cIndexData.length} rows with metric='c_index'`);

        console.log('All data loaded successfully.');
        preparePercentilesData(); 
        calcButton.disabled = false;
        calcButton.textContent = 'Calculate Risk';
        
        initializePage();
    } else {
        console.error('One or more data files failed to load. Application cannot proceed.');
        alert('Critical data files could not be loaded. The application will not function correctly.');
    }
});


/**
 * Sets up all the interactive elements on the page.
 */
function initializePage() {
    initializeButtons();
    setupRiskCalculator();
    setupPerformanceComparison();
    initializeSliders();
    setupAutoCalculations();
}

/**
 * Adds event listeners to all button groups and sliders.
 */
function initializeButtons() {
    document.querySelectorAll('.button-group').forEach(group => {
        group.querySelectorAll('.button-option').forEach(button => {
            button.addEventListener('click', function() {
                group.querySelectorAll('.button-option').forEach(sib => sib.classList.remove('selected'));
                this.classList.add('selected');
            });
        });
    });

    const exclusiveCheckboxes = document.querySelectorAll('.exclusive');
    exclusiveCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                exclusiveCheckboxes.forEach(otherCheckbox => {
                    if (otherCheckbox !== this) otherCheckbox.checked = false;
                });
            }
        });
    });
}

function initializeSliders() {
    ['townsend', 'prs', 'metscore', 'proscore'].forEach(key => {
        const slider = document.getElementById(key);
        if (slider) {
            slider.addEventListener('input', function() {
                updateSliderValue(`${key}-value`, this.value);
            });
        }
    });
}

function calculateBMI() {
    const heightCm = parseFloat(document.getElementById('height').value);
    const weightKg = parseFloat(document.getElementById('weight').value);
    const bmiInput = document.getElementById('bmi');

    if (heightCm > 0 && weightKg > 0) {
        const heightM = heightCm / 100;
        const bmi = weightKg / (heightM * heightM);
        bmiInput.value = bmi.toFixed(1);
    }
}

function setupAutoCalculations() {
    document.getElementById('height').addEventListener('input', calculateBMI);
    document.getElementById('weight').addEventListener('input', calculateBMI);
}


function getDiseaseCode(diseaseName) {
    const reverseMap = Object.fromEntries(Object.entries(diseaseMap).map(([code, name]) => [name, code]));
    return reverseMap[diseaseName];
}


function collectFormData() {
    const formData = {};

    const continuousVars = [
        'age', 'sbp', 'dbp', 'height', 'weight', 'waist_cir', 
        'waist_hip_ratio', 'bmi', 'baso', 'eos', 'hct', 'hb', 
        'lc', 'mc', 'nc', 'plt', 'wbc'
    ];
    continuousVars.forEach(varName => {
        formData[varName] = document.getElementById(varName).value;
    });
    
    const sliderVars = ['townsend', 'prs', 'metscore', 'proscore'];
    sliderVars.forEach(varName => {
        formData[varName] = document.getElementById(varName).value;
    });

    formData['male_1.0'] = document.querySelector('.form-group .button-group .button-option:nth-child(1).selected')?.textContent === 'Male' ? 1 : 0;
    
    const ethnicityButton = document.querySelector('.form-group .button-group .button-option.selected');
    formData['ethnicity'] = parseInt(ethnicityButton.getAttribute('data-value'));

    const binaryMappings = {
        "Current Smoking": "current_smoking_1.0",
        "Daily Alcohol Intake": "daily_drinking_1.0",
        "Healthy Sleep": "healthy_sleep_1.0",
        "Physical activity": "physical_act_1.0",
        "Healthy diet": "healthy_diet_1.0",
        "Social connection": "social_active_1.0",
        "Family History of Heart Disease": "family_heart_hist_1.0",
        "Family History of Stroke": "family_stroke_hist_1.0",
        "Family History of Hypertension": "family_hypt_hist_1.0",
        "Family History of Diabetes": "family_diab_hist_1.0",
        "History of Hypertension": "hypt_hist_1.0",
        "History of Diabetes": "diab_hist_1.0",
        "Lipid-lowering Medication": "lipidlower_1.0",
        "Antihypertensive Medication": "antihypt_1.0"
    };

    Object.entries(binaryMappings).forEach(([labelText, varName]) => {
        const formGroup = Array.from(document.querySelectorAll('.form-group')).find(group => {
            const label = group.querySelector('.form-label');
            return label && label.textContent.trim() === labelText;
        });
        if (formGroup) {
            const selectedOption = formGroup.querySelector('.button-option.selected');
            formData[varName] = selectedOption ? parseInt(selectedOption.getAttribute('data-value')) : 0;
        }
    });

    return formData;
}


function calculateRisk() {
    const formData = collectFormData();
    const parsedData = {};

    for (const key in formData) {
        if(key === 'male_1.0' || key.startsWith('ethnicity') || key.includes('_1.0')) {
             parsedData[key] = formData[key];
             continue;
        }
        const value = parseFloat(formData[key]);
        if (isNaN(value)) {
            const friendlyName = friendlyVariableNames[key] || key;
            alert(`Please enter a valid number for: ${friendlyName}`);
            return; 
        }
        parsedData[key] = value;
    }

    const diseaseSelect = document.querySelector('#disease-select');
    const selectedDiseaseName = diseaseSelect.options[diseaseSelect.selectedIndex].text;
    document.querySelector('#selected-disease-name').textContent = selectedDiseaseName;
    document.querySelector('#selected-disease-desc').textContent = selectedDiseaseName.toLowerCase();
    document.querySelector('#disease-risk').textContent = 'Calculating...';
    document.querySelector('#risk-results').style.display = 'block';
    document.querySelector('#risk-results').scrollIntoView({ behavior: 'smooth' });

    
    const ethnicityValue = parsedData.ethnicity;
    parsedData['ethnicity_1.0'] = 0;
    parsedData['ethnicity_2.0'] = 0;
    parsedData['ethnicity_3.0'] = 0;
    switch (ethnicityValue) {
        case 1: parsedData['ethnicity_1.0'] = 1; break;
        case 2: parsedData['ethnicity_2.0'] = 1; break;
        case 3: parsedData['ethnicity_3.0'] = 1; break;
    }
    delete parsedData.ethnicity;
    
    const selectedDiseaseCode = getDiseaseCode(selectedDiseaseName);

    const percentileVars = ['townsend', 'prs', 'metscore', 'proscore'];
    for (const pVar of percentileVars) {
        const percentileValue = parsedData[pVar];
        try {
            const actualScore = percentileMap[selectedDiseaseCode][pVar][percentileValue];
            if (actualScore === undefined) {
                throw new Error(`Value not found for p${percentileValue}`);
            }
            parsedData[pVar] = actualScore; 
        } catch (e) {
            alert(`Could not find percentile mapping for "${pVar}" for the selected disease. Please check the 'percentiles.csv' file.`);
            console.error(`Error looking up percentile for ${pVar}:`, e);
            return;
        }
    }

    const scaledData = {};
    const panelVars = [
        'age', 'sbp', 'dbp', 'height', 'weight', 'waist_cir', 'waist_hip_ratio', 
        'bmi', 'baso', 'eos', 'hct', 'hb', 'lc', 'mc', 'nc', 'plt', 'wbc'
    ];
    
    let scalingError = false;
    panelVars.forEach(v => {
        if (scalingError) return;
        const params = panelScalerParams.find(p => p.feature === v);
        
        if (params) {
            const mean = parseFloat(params.mean);
            const variance = parseFloat(params.variance);
            const std = Math.sqrt(variance);
            if (std === 0) {
                console.error(`Standard deviation is zero for variable: '${v}'. Cannot scale.`);
                alert(`Error: Scaling parameter for '${v}' is invalid (Standard Deviation is 0).`);
                scalingError = true;
                return;
            }
            scaledData[v] = (parsedData[v] - mean) / std;
        } else {
            console.error(`Could not find scaling parameters for variable: '${v}'. Please check 'PANEL_scaler_params.csv'.`);
            alert(`Error: Scaling parameters for '${v}' are missing. The calculation cannot proceed.`);
            scalingError = true;
        }
    });

    if (scalingError) {
        document.querySelector('#disease-risk').textContent = '--';
        return;
    }
    
    let linearPredictor = 0;
    const featureColumnName = Object.keys(coefficients[0])[0];
    const diseaseCoefficients = coefficients.map(row => ({
        variable: row[featureColumnName],
        value: parseFloat(row[selectedDiseaseCode])
    }));

    diseaseCoefficients.forEach(coeff => {
        const varName = coeff.variable;
        const coeffValue = coeff.value;
        if (isNaN(coeffValue)) { return; }
        if (scaledData.hasOwnProperty(varName)) {
            linearPredictor += scaledData[varName] * coeffValue;
        } else if (parsedData.hasOwnProperty(varName)) {
            linearPredictor += parsedData[varName] * coeffValue;
        }
    });
    
    let baselineSurvivalProb = null;
    const targetTime = 10;
    const diseaseSurvivalData = baselineSurvivals
        .map(row => ({
            time: parseFloat(row.Time),
            survival: parseFloat(row[selectedDiseaseCode])
        }))
        .filter(point => !isNaN(point.survival) && !isNaN(point.time));
    const candidates = diseaseSurvivalData.filter(point => point.time <= targetTime);
    if (candidates.length > 0) {
        const lastStep = candidates.reduce((latest, current) => {
            return current.time > latest.time ? current : latest;
        });
        baselineSurvivalProb = lastStep.survival;
    } else {
        console.warn(`No baseline survival data found for "${selectedDiseaseName}" at or before ${targetTime} years. Assuming 100% survival.`);
        baselineSurvivalProb = 1.0;
    }
    
    const hazardRatio = Math.exp(linearPredictor);
    const predictedSurvival = Math.pow(baselineSurvivalProb, hazardRatio);
    const predictedRisk = 1 - predictedSurvival;
    
    document.querySelector('#disease-risk').textContent = (predictedRisk * 100).toFixed(1) + '%';
}


function setupRiskCalculator() {
    const calculateButton = document.querySelector('#calculate-risk-button');
    if (calculateButton) {
        calculateButton.addEventListener('click', calculateRisk);
    }
}

function updateSliderValue(valueId, value) {
    const element = document.getElementById(valueId);
    if (element) {
        element.textContent = value;
    }
}


// --- START: Rewritten functions for the Populational Predictive Performance Tab ---

function mapModelName(modelName) {
    if (!modelName) return "";
    return modelName
        .replace(/Clinical/g, 'Clin')
        .replace(/Genomics/g, 'PRS')
        .replace(/Metabolomics/g, 'MetScore')
        .replace(/Proteomics/g, 'ProScore')
        .replace(/_/g, '+');
}

function canonicalizeModelName(modelName) {
    if (!modelName || !modelName.includes('+')) {
        return modelName;
    }
    const parts = modelName.split('+');
    const baseModel = parts[0];
    const omics = parts.slice(1);
    
    const omicsOrder = ['PRS', 'MetScore', 'ProScore'];
    omics.sort((a, b) => omicsOrder.indexOf(a) - omicsOrder.indexOf(b));
    
    return [baseModel, ...omics].join('+');
}

function generateModelCombinations(baseModel, omicsArray) {
    if (!baseModel) return [];
    const combinations = [];
    const n = omicsArray.length;

    for (let i = 0; i < (1 << n); i++) {
        const subset = [];
        for (let j = 0; j < n; j++) {
            if ((i & (1 << j)) > 0) {
                subset.push(omicsArray[j]);
            }
        }
        const modelName = canonicalizeModelName([baseModel, ...subset].join('+'));
        combinations.push(modelName);
    }
    return combinations;
}

function setupPerformanceComparison() {
    document.querySelector('#generate-results-button').addEventListener('click', function() {
        const selectedCVDs = Array.from(document.querySelectorAll('input[name="cvd"]:checked'))
            .map(checkbox => checkbox.value);
        
        const selectedBaseModel = document.querySelector('input.exclusive:checked')?.value;
        const selectedOmics = Array.from(document.querySelectorAll('input[name="predictor"]:not(.exclusive):checked'))
            .map(checkbox => checkbox.value);

        if (selectedCVDs.length === 0) {
            alert('Please select at least one cardiovascular disease.');
            return;
        }
        if (!selectedBaseModel) {
            alert('Please select one base predictor (AgeSex, Clin, or PANEL).');
            return;
        }
        
        const requiredModels = generateModelCombinations(selectedBaseModel, selectedOmics);
        
        const filteredData = cIndexData
            .filter(row => selectedCVDs.includes(row.outcome))
            .map(row => ({
                ...row,
                mappedModelName: mapModelName(row.comparison_model),
                canonicalModelName: canonicalizeModelName(mapModelName(row.comparison_model))
            }))
            .filter(row => requiredModels.includes(row.canonicalModelName));
        
        updateResultsTable(filteredData);
        updatePerformanceChart(filteredData);
    });
}

function updateResultsTable(filteredData) {
    const tableBody = document.getElementById('results-table-body');
    tableBody.innerHTML = '';

    if (filteredData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4">No data available for the selected criteria.</td></tr>';
        return;
    }
    
    filteredData.forEach(data => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${data.mappedModelName}</td>
            <td>${diseaseMap[data.outcome] || data.outcome}</td>
            <td>${parseFloat(data.point_estimate).toFixed(2)}</td>
            <td>${parseFloat(data.ci_lower).toFixed(2)}–${parseFloat(data.ci_upper).toFixed(2)}</td>
        `;
        tableBody.appendChild(row);
    });
}

function updatePerformanceChart(filteredData) {
    const chartElement = document.getElementById('performance-chart');
    chartElement.innerHTML = '';
    
    if (filteredData.length === 0) {
        chartElement.innerHTML = '<div style="text-align: center; padding: 20px;">No data available for the selected criteria.</div>';
        return;
    }
    
    const margin = {top: 80, right: 20, bottom: 200, left: 80};
    const chartPlotHeight = 350;
    const svgHeight = chartPlotHeight + margin.top + margin.bottom;

    const predictors = [...new Set(filteredData.map(item => item.canonicalModelName))].sort((a,b) => a.split('+').length - b.split('+').length || a.localeCompare(b));
    const chartRenderWidth = Math.max(chartElement.offsetWidth - margin.left - margin.right, predictors.length * 150);
    
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", chartRenderWidth + margin.left + margin.right);
    svg.setAttribute("height", svgHeight);
    chartElement.appendChild(svg);

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("transform", `translate(${margin.left}, ${margin.top})`);
    svg.appendChild(g);
    
    const { predictorDiseaseGroups, diseaseGroups } = groupPerformanceData(filteredData);
    
    const diseaseOrder = ['Coronary artery disease', 'Stroke', 'Heart failure', 'Atrial fibrillation', 'Peripheral artery disease', 'Venous thromboembolism'];
    const colors = {
        'Coronary artery disease': "#E64B35FF", 'Stroke': "#4DBBD5FF", 'Heart failure': "#00A087FF",
        'Atrial fibrillation': "#3C5488FF", 'Peripheral artery disease': "#F39B7FFF", 'Venous thromboembolism': "#8491B4FF"
    };
    
    const xScale = d3_scalePoint().domain(predictors).range([0, chartRenderWidth]).padding(0.5);
    const yScale = d3_scaleLinear().domain([0.5, 1.0]).range([chartPlotHeight, 0]);
    
    createXAxis(g, xScale, predictors, chartPlotHeight, chartRenderWidth);
    createYAxis(g, yScale, chartPlotHeight, chartRenderWidth, "C-index");
    
    Object.values(predictorDiseaseGroups).forEach(items => {
        items.sort((a, b) => diseaseOrder.indexOf(diseaseMap[a.outcome]) - diseaseOrder.indexOf(diseaseMap[b.outcome]));
        const offsetStep = 20;
        const totalWidth = (items.length - 1) * offsetStep;
        const startOffset = -totalWidth / 2;
        items.forEach((item, index) => item.xOffset = startOffset + (index * offsetStep));
    });
    
    const sortedDiseaseGroups = Object.entries(diseaseGroups).sort((a,b) => diseaseOrder.indexOf(a[0]) - diseaseOrder.indexOf(b[0]));

    sortedDiseaseGroups.forEach(([disease, items]) => {
        const color = colors[disease] || '#000000';
        items.forEach(item => drawErrorBarAndPoint(g, item, xScale, yScale, color));
    });
    
    drawLegend(svg, sortedDiseaseGroups.map(d => d[0]), colors, chartRenderWidth + margin.left + margin.right);
}

function groupPerformanceData(filteredData) {
    const predictorDiseaseGroups = {};
    const diseaseGroups = {};
    filteredData.forEach(item => {
        const modelName = item.canonicalModelName;
        const diseaseName = diseaseMap[item.outcome] || item.outcome;
        if (!predictorDiseaseGroups[modelName]) predictorDiseaseGroups[modelName] = [];
        predictorDiseaseGroups[modelName].push(item);
        if (!diseaseGroups[diseaseName]) diseaseGroups[diseaseName] = [];
        diseaseGroups[diseaseName].push(item);
    });
    return { predictorDiseaseGroups, diseaseGroups };
}

// --- SVG/D3-like drawing functions ---
function d3_scaleLinear() { let d=[0,1], r=[0,1]; function s(v){return r[0]+(v-d[0])/(d[1]-d[0])*(r[1]-r[0])} s.domain=function(_){return arguments.length?(d=_,s):d}; s.range=function(_){return arguments.length?(r=_,s):r}; return s; }
function d3_scalePoint() { let d=[], r=[0,1], p=0; function s(v){return r[0]+(r[1]-r[0])/(Math.max(1,d.length-1+p*2))*(d.indexOf(v)+p)} s.domain=function(_){return arguments.length?(d=_,s):d}; s.range=function(_){return arguments.length?(r=_,s):r}; s.padding=function(_){return arguments.length?(p=_,s):p}; return s; }

function createXAxis(g, xScale, predictors, height, width) {
    const axis = document.createElementNS("http://www.w3.org/2000/svg", "g");
    axis.setAttribute("transform", `translate(0,${height})`);
    g.appendChild(axis);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M0,0H${width}`);
    path.setAttribute("stroke", "black");
    axis.appendChild(path);

    predictors.forEach(p => {
        const x = xScale(p);
        
        const tickLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tickLine.setAttribute("x1", x);
        tickLine.setAttribute("x2", x);
        tickLine.setAttribute("y1", 0);
        tickLine.setAttribute("y2", 6);
        tickLine.setAttribute("stroke", "black");
        axis.appendChild(tickLine);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        // CORRECTED: Final adjustment for rotated labels
        text.setAttribute("x", x);
        text.setAttribute("y", 9);
        text.setAttribute("text-anchor", "end"); // Align the END of the text to the tick
        text.setAttribute("transform", `rotate(-45,${x},9)`); // Rotate -45 degrees
        text.setAttribute("dominant-baseline", "middle");
        text.textContent = p;
        axis.appendChild(text);
    });
}

function createYAxis(g, yScale, height, width, titleText) {
    const axis = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.appendChild(axis);

    const axisPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    axisPath.setAttribute("d", `M0,0V${height}`);
    axisPath.setAttribute("stroke", "black");
    axis.appendChild(axisPath);

    const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
    title.setAttribute("transform", `translate(-50,${height/2}) rotate(-90)`);
    title.setAttribute("text-anchor", "middle");
    title.setAttribute("font-weight", "bold");
    title.textContent = titleText;
    axis.appendChild(title);

    const ticks = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

    ticks.forEach(t => {
        const y = yScale(t);

        const gridLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        gridLine.setAttribute("x1", 0);
        gridLine.setAttribute("x2", width);
        gridLine.setAttribute("y1", y);
        gridLine.setAttribute("y2", y);
        gridLine.setAttribute("stroke", "#e0e0e0");
        gridLine.setAttribute("stroke-dasharray", "3,3");
        g.appendChild(gridLine);

        const tickLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tickLine.setAttribute("x1", -6);
        tickLine.setAttribute("x2", 0);
        tickLine.setAttribute("y1", y);
        tickLine.setAttribute("y2", y);
        tickLine.setAttribute("stroke", "black");
        axis.appendChild(tickLine);

        const tickText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        tickText.setAttribute("x", -10);
        tickText.setAttribute("y", y);
        tickText.setAttribute("text-anchor", "end");
        tickText.setAttribute("dominant-baseline", "middle");
        tickText.textContent = t.toFixed(1);
        axis.appendChild(tickText);
    });
}
function drawErrorBarAndPoint(g, item, xScale, yScale, color) { const x=xScale(item.canonicalModelName)+(item.xOffset||0), y=yScale(item.point_estimate), yL=yScale(item.ci_lower), yH=yScale(item.ci_upper); const diseaseName = diseaseMap[item.outcome] || item.outcome; const el=document.createElementNS("http://www.w3.org/2000/svg","g"); el.innerHTML=`<line x1="${x}" x2="${x}" y1="${yL}" y2="${yH}" stroke="${color}" stroke-width="1.5"></line><line x1="${x-4}" x2="${x+4}" y1="${yH}" y2="${yH}" stroke="${color}" stroke-width="1.5"></line><line x1="${x-4}" x2="${x+4}" y1="${yL}" y2="${yL}" stroke="${color}" stroke-width="1.5"></line><circle cx="${x}" cy="${y}" r="5" fill="${color}"><title>${diseaseName}, ${item.mappedModelName}: ${parseFloat(item.point_estimate).toFixed(2)} (${parseFloat(item.ci_lower).toFixed(2)}-${parseFloat(item.ci_upper).toFixed(2)})</title></circle>`; g.appendChild(el); }
function drawLegend(svg, orderedDiseases, colors, svgWidth) {
    const legend = document.createElementNS("http://www.w3.org/2000/svg","g");
    const legendItems = [];
    let totalLegendWidth = 0;

    orderedDiseases.forEach(d => {
        const textWidth = d.length * 7;
        const itemWidth = 20 + textWidth + 25;
        legendItems.push({ text: d, color: colors[d] || '#000', width: itemWidth });
        totalLegendWidth += itemWidth;
    });

    const startX = (svgWidth / 2) - (totalLegendWidth / 2);
    let xOffset = 0;

    legend.setAttribute("transform",`translate(${startX}, 20)`);
    svg.appendChild(legend);

    legendItems.forEach(itemData => {
        const item = document.createElementNS("http://www.w3.org/2000/svg","g");
        item.setAttribute("transform", `translate(${xOffset}, 0)`);
        item.innerHTML = `<rect x="0" y="0" width="12" height="12" fill="${itemData.color}"></rect><text x="20" y="10" font-size="12px" dominant-baseline="middle">${itemData.text}</text>`;
        legend.appendChild(item);
        xOffset += itemData.width;
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelector(`.tab[onclick="switchTab('${tabId}')"]`).classList.add('active');
}
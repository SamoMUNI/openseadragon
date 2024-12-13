(function($) {

    /**
     * Organizer of shaders
     * @class OpenSeadragon.WebGLModule.ShaderMediator
     * @property {object} _layers storage of shaders, shader.type(): <shader>
     * @property {boolean} _acceptsShaders allow new shaders
     */
    $.WebGLModule.ShaderMediator = class {
        /**
         * Register shader (add shader to _layers object)
         * @param {typeof OpenSeadragon.WebGLModule.ShaderLayer} LayerRendererClass static class definition
         */
        static registerLayer(LayerRendererClass) {
            //todo why not hasOwnProperty check allowed by syntax checker
            // if (this._layers.hasOwnProperty(LayerRendererClass.type())) {
            //     console.warn("Registering an already existing layer renderer:", LayerRendererClass.type());
            // }
            // if (!$.WebGLModule.SthishaderLayer.isPrototypeOf(LayerRendererClass)) {
            //     throw `${LayerRendererClass} does not inherit from ShaderLayer!`;
            // }static
            if (this._acceptsShaders) {
                this._layers[LayerRendererClass.type()] = LayerRendererClass;
            } else {
                console.warn("OpenSeadragon.WebGLModule.ShaderMediator::registerLayer(LayerRendererClass) ShaderMediator is set to not accept new shaders");
            }
        }

        /**
         * Enable or disable shader registrations
         * @param {boolean} accepts
         */
        static setAcceptsRegistrations(accepts) {
            if (accepts === true || accepts === false) {
                this._acceptsShaders = accepts;
            } else {
                console.warn("OpenSeadragon.WebGLModule.ShaderMediator::setAcceptsRegistrations(accepts) Accepts parameter must be either true or false");
            }
        }

        /**
         * Get the shader implementation by type id
         * @param {string} id
         * @return {function} class extends OpenSeadragon.WebGLModule.ShaderLayer
         */
        static getClass(id) {
            return this._layers[id];
        }

        /**
         * Get all available shaders
         * @return {typeof OpenSeadragon.WebGLModule.ShaderLayer[]} classes that extend OpenSeadragon.WebGLModule.ShaderLayer
         */
        static availableShaders() {
            return Object.values(this._layers);
        }

        /**
         * Get all available shaders
         * @return {string[]} classes that extend OpenSeadragon.WebGLModule.ShaderLayer
         */
        static availableTypes() {
            return Object.keys(this._layers);
        }
    };
    // attributes that should've been static but cannot be so because of the old version of javascript
    $.WebGLModule.ShaderMediator._acceptsShaders = true;
    $.WebGLModule.ShaderMediator._layers = {};

    $.WebGLModule.BLEND_MODE = {
        'source-over': 0,
        'source-in': 1,
        'source-out': 1,
        'source-atop': 1,
        'destination-over': 1,
        'destination-in': 1,
        'destination-out': 1,
        'destination-atop': 1,
        lighten: 1,
        darken: 1,
        copy: 1,
        xor: 1,
        multiply: 1,
        screen: 1,
        overlay: 1,
        'color-dodge': 1,
        'color-burn': 1,
        'hard-light': 1,
        'soft-light': 1,
        difference: 1,
        exclusion: 1,
        hue: 1,
        saturation: 1,
        color: 1,
        luminosity: 1
    };
    $.WebGLModule.BLEND_MODE_MULTIPLY = 1;

    /**
     * Abstract interface to any Shader.
     * @abstract
     */
    $.WebGLModule.ShaderLayer = class {

        /**
         * Override **static** type definition
         * The class must be registered using the type
         * @returns {string} unique id under which is the shader registered
         */
        static type() {
            throw "ShaderLayer::type() Type must be specified!";
        }

        /**
         * Override **static** name definition
         * @returns {string} name of the shader (user-friendly)
         */
        static name() {
            throw "ShaderLayer::name() Name must be specified!";
        }

        /**
         * Provide description
         * @returns {string} optional description
         */
        static description() {
            return "ShaderLayer::description() WebGL shader should provide description.";
        }

        /**
         * Declare the number of data sources it reads from (how many dataSources indexes should the shader contain)
         * @return {Array.<Object>} array of source specifications:
         *  acceptsChannelCount: predicate that evaluates whether given number of channels (argument) is acceptable
         *  [optional] description: the description of the source - what it is being used for
         */
        static sources() {
            throw "ShaderLayer::sources() Shader must specify channel acceptance predicates for each source it uses!";
        }

        /**
         * Global supported options
         * @param {string} id unique ID among all webgl instances and shaders
         * @param {object} privateOptions options that should not be touched, necessary for linking the layer to the core
         * @param {object} privateOptions.shaderObject concrete shader object definition from spec.shaders
         * @param {WebGLImplementation} privateOptions.webglContext
         * @param {boolean} privateOptions.interactive
         * @param {function} privateOptions.invalidate
         * @param {function} privateOptions.rebuild
         * @param {function} privateOptions.refetch
         */
        constructor(id, privateOptions) {
            // "rendererId" + <index of shader in spec.shaders>
            this.uid = id;
            if (!$.WebGLModule.idPattern.test(this.uid)) {
                console.error(`Invalid ID for the shader: ${id} does not match to the pattern`, $.WebGLModule.idPattern);
            }

            this.webglContext = privateOptions.webglContext;
            this.__shaderObject = privateOptions.shaderObject; // shaderObject from spec.shaders
            this._controls = privateOptions.controls; // shaderObject._controls
            this._hasInteractiveControls = privateOptions.interactive;
            this._cache = privateOptions.cache; // shaderObject._cache
            this._customControls = privateOptions.shaderObject.params;

            this.invalidate = privateOptions.invalidate;
            this._rebuild = privateOptions.rebuild;
            this._refetch = privateOptions.refetch;

        }

        /**
         * Manual constructor, must call super.construct(...) if overridden, but unlike
         * constructor the call can be adjusted (e.g. adjust option values)
         * @param {object} options this.__shaderObject.params
         * @param {string} options.use_channel[X]: "r", "g" or "b" channel to sample index X, default "r"
         * @param {string} options.use_mode: blending mode - default alpha ("show"), custom blending ("mask") and clipping mask blend ("mask_clip")
         * @param {[number]} dataReferences indexes of data being requested for this shader (this.__shaderObject.dataReferences)
         */
        /* options = {}, dataReferences = [0] */
        construct(options = {}, dataReferences = [0]) {
            this._ownedControls = [];
            // prechadza controls v defaultControls a nastavi pre kazdy this[control] = <SimpleUIControl>, plus mena da do _ownedControls
            this._buildControls(options);
            // nastavi this.__channels na ["rgba"] plus do shaderObject.cache da use_channel0: "rgba" (opacity tam este neni!)
            this.resetChannel(options);
            // nastavi this._mode a this.__mode na "show", inak by mohla aj do cache nastavovat...
            this.resetMode(options);
        }

        /**
         *
         * @param {object} options this.__shaderObject.params
         * @param {string} options.use_channel[X]: "r", "g" or "b" channel to sample index X, default "r"
         * @param {string} options.use_mode: blending mode - default alpha ("show"), custom blending ("mask") and clipping mask blend ("mask_clip")
         * @param {[number]} dataReferences indexes of data being requested for this shader (this.__shaderObject.dataReferences)
         */
        newConstruct(options = {}) {
            this.resetChannel(options);
            this.resetMode(options);

            this.resetFilters(this._customControls);
        }

        /**
         *
         * @param {object} shaderObject unique object bind to this shader
         * @param {string} shaderID unique identification of the data source bind to this shader's controls = "<tiledImageIndex>_<dataSourceIndex>"
         * @param {HTMLElement} controlsParentHTMLElement
         * @param {function} controlsChangeHandler
         */
        newAddControl(shaderObject, shaderID, controlsParentHTMLElement = null, controlsChangeHandler = null) {
            const defaultControls = this.constructor.defaultControls;

            // add opacity control manually to every shader if not already defined
            if (defaultControls.opacity === undefined || (typeof defaultControls.opacity === "object" && !defaultControls.opacity.accepts("float"))) {
                defaultControls.opacity = {
                    default: {type: "range", default: 1, min: 0, max: 1, step: 0.1, title: "Opacity: "},
                    accepts: (type, instance) => type === "float"
                };
            }

            // console.debug(`defaultControls of ${this.constructor.name()} shader =`, defaultControls);
            for (let controlName in defaultControls) {
                if (controlName.startsWith("use_")) {
                    continue;
                }

                // console.debug('newAddControl, prechadzam defaultControls, controlName =', controlName);
                const controlObject = defaultControls[controlName];
                if (!controlObject) { // pridane iba kvoli codingVisualizationLayer, ktory ma ze opacity: false -.- -> vykomentoval som to tam
                    console.warn(`Control ${controlName} not defined in ${this.constructor.name()} shader's defaultControls!`);
                    continue;
                }
                const control = $.WebGLModule.UIControls.build(this, controlName, controlObject, shaderID + '_' + controlName, this._customControls[controlName]);

                // console.debug('newAddControl, vytvoril som control', controlName, control);
                this._controls[controlName] = control;
                this[controlName] = control;
            }
        }

        /**
         * @param {object} shaderObject unique object bind to the dataSource
         * @param {string} shaderID unique identification of the data source bind to this shader's controls = "<tiledImageIndex>_<dataSourceIndex>"
         *
         */
        newRemoveControl(shaderObject, shaderID) {
            for (const controlName in this._controls) {
                const control = this[controlName];
                control.destroy();
                delete this[controlName];

                delete shaderObject._controls[controlName];
                // delete shaderObject._cache[controlName]; // kedze cache je naprogramovana neviem ako ale kluce su tam dake mena tak neviem ju zrusit
            }
        }

        newHtmlControls() {
            const controlsHtmls = [];
            for (const controlName in this._controls) {
                const control = this[controlName];
                controlsHtmls.push(control.toHtml(true));
            }
            return controlsHtmls.join("");
        }

        registerControlsHandlers(callback) {
            for (const controlName in this._controls) {
                const control = this[controlName];
                control.registerDOMElementEventHandler(callback);
            }
        }

        initControls() {
            for (const controlName in this._controls) {
                const control = this[controlName];
                control.init();
            }
        }

        usesCustomBlendFunction() {
            return this._mode !== "show";
        }
        getCustomBlendFunction() {
            return `vec4 ${this.uid}_blend_func(vec4 fg, vec4 bg) {
        return fg;
    }`;
        }
        getModeFunction() {
            let modeDefinition = `void ${this.uid}_blend_mode(vec4 color) {`;
            if (this._mode === "show") {
                modeDefinition += `
        // blend last_color with overall_color using blend_func of the last shader using deffered blending
        deffered_blend();
        last_color = color;
        // switch case -2 = predefined "premultiplied alpha blending"
        last_blend_func_id = -2;
    }`;
            }
            else if (this._mode === "mask") {
                modeDefinition += `
        // blend last_color with overall_color using blend_func of the last shader using deffered blending
        deffered_blend();
        last_color = color;
        // switch case pointing to this.getCustomBlendFunction() code
        last_blend_func_id = ${this.webglContext.getShaderLayerGLSLIndex(this.uid)};
    }`;
            } else if (this._mode === "mask_clip") {
                modeDefinition += `
        last_color = ${this.uid}_blend_func(color, last_color);
    }`;
            }

            return modeDefinition;
        }

        /**
         * Code placed outside fragment shader's main(...).
         * By default, it includes all definitions of
         * controls you defined in defaultControls
         *
         *  NOTE THAT ANY VARIABLE NAME
         *  WITHIN THE GLOBAL SPACE MUST BE
         *  ESCAPED WITH UNIQUE ID: this.uid
         *
         *  DO NOT SAMPLE TEXTURE MANUALLY: use this.sampleChannel(...) to generate the code
         *
         *  WHEN OVERRIDING, INCLUDE THE OUTPUT OF THIS METHOD AT THE BEGINNING OF THE NEW OUTPUT.
         *
         * @return {string}
         */
        getFragmentShaderDefinition() {
            let glsl = [this.getModeFunction(), this.usesCustomBlendFunction() ? this.getCustomBlendFunction() : ''];
            //console.log('shader controls', this._ownedControls);
            /* only opacity in _ownedControls, dont know where is use_channel0 from plain shader ??? */
            for (const controlName in this._controls) {
                // `uniform controlGLtype controlGLname;`
                // `uniform controlGLtype controlGLname;`
                let code = this[controlName].define();
                if (code) {
                    // trim removes whitespace from beggining and the end of the string
                    glsl.push(code.trim());
                }
            }

            /* map adds tabs to glsl code lines, join puts them all together separating them with newlines
                (join used because we do not want to add newline to the last line of code) */
            let retval = glsl.map((glLine) => "    " + glLine).join("\n");
            return retval;
        }

        setBlendMode(name) {
            const modes = $.WebGLModule.BLEND_MODE;
            // cislo, bud 0 alebo 1 udavajuce global blend mode
            this.blendMode = modes[name];
            if (this.blendMode === undefined) {
                this.blendMode = modes["source-over"];
            }
        }

        /**
         * Code executed to create the output color. The code
         * must always return a vec4 value, otherwise the visualization
         * will fail to compile (this code actually runs inside a vec4 function).
         *
         *  DO NOT SAMPLE TEXTURE MANUALLY: use this.sampleChannel(...) to generate the code
         *
         * @return {string}
         */
        getFragmentShaderExecution() {
            throw "ShaderLayer::getFragmentShaderExecution must be implemented!";
        }

        /** Called when an image is rendered.
         * Fill this shader's clip + blend glsl variables.
         * For every control fill it's corresponding glsl variable.
         * @param {WebGLProgram} program WebglProgram instance
         * @param {WebGLRenderingContext|WebGL2RenderingContext} gl WebGL Context
         */
        glDrawing(program, gl) {


            // for (let control of this._ownedControls) {
            //     // console.log(`shaderLayer ${this.constructor.name()} filling ${control}`);

            //     //FIXME: dimension param
            //     this[control].glDrawing(program, gl);
            // }
            for (const controlName in this._controls) {
                // console.log('shaderLayer gl drawing, this._controls =', this._controls);
                // console.log('shaderLayer gl drawing, controlName =', controlName);
                // console.log('shaderLayer gl drawing, controlId =', controlId);

                // const control = this._controls[controlName][controlId];
                // klasika co som zatial mal
                // if (control instanceof $.WebGLModule.UIControls.SimpleUIControl) {
                    this[controlName].glDrawing(program, gl);
                // } else { // jirka si pridal do glDrawing dimension
                    // console.warn('Tu som');
                    // this._controls[controlName][controlId].glDrawing(program, undefined, gl);
                // }
            }
        }

        /** Called when loading webgl program.
         * Connect _clipLoc + _blendLoc with their corresponding glsl variables.
         * For every control owned by this shader connect control.glLocation attribute to it's corresponding glsl variable.
         * @param {WebGLProgram} program WebglProgram instance
         * @param {WebGLRenderingContext|WebGL2RenderingContext} gl WebGL Context
         */
        glLoaded(program, gl) {

            for (const controlName in this._controls) {
                // console.log(`shaderLayer ${this.constructor.name()} loading ${control}`);
                this[controlName].glLoaded(program, gl);
            }
        }

        /**
         * This function is called once at
         * the beginning of the layer use
         * (might be multiple times), after htmlControls()
         */
        init() {
            // if (!this.initialized()) {
            //     console.error("Shader not properly initialized! Call shader.construct()!");
            // }
            for (const controlName in this._controls) {
                const control = this[controlName];
                control.init();
            }
        }

        /**
         * Get the shader UI controls
         * @return {string} HTML controls for the particular shader
         */
        htmlControls() {
            let html = [];
            for (let control of this._ownedControls) {
                const target = this[control];
                if (target) {
                    html.push(target.toHtml(true));
                }
            }
            return html.join("");
        }

        /**
         * Include GLSL shader code on global scope
         * (e.g. define function that is repeatedly used)
         * does not have to use unique ID extended names as this code is included only once
         * @param {string} key a key under which is the code stored, so that the same key is not loaded twice
         * @param {string} code GLSL code to add to the shader
         */
        includeGlobalCode(key, code) {
            let container = this.constructor.__globalIncludes;
            if (!container[key]) {
                container[key] = code;
            }
        }

        /**
         * @param {string} controlName name of control to delete
         */
        removeControl(controlName) {
            if (!this._ownedControls[controlName]) {
                return;
            }
            delete this._ownedControls[controlName];
            delete this[controlName];
        }

        /**
         * Check if shader is initialized.
         * @return {boolean}
         */
        initialized() {
            return !!this._ownedControls;
        }

        /**
         * Parses value to a float string representation with given precision (length after decimal)
         * @param {number} value value to convert
         * @param {number} defaultValue default value on failure
         * @param {number} precisionLen number of decimals
         * @return {string}
         */
        toShaderFloatString(value, defaultValue, precisionLen = 5) {
            return this.constructor.toShaderFloatString(value, defaultValue, precisionLen);
        }

        /**
         * Parses value to a float string representation with given precision (length after decimal)
         * @param {number} value value to convert
         * @param {number} defaultValue default value on failure
         * @param {number} precisionLen number of decimals
         * @return {string}
         */
        static toShaderFloatString(value, defaultValue, precisionLen = 5) {
            if (!Number.isInteger(precisionLen) || precisionLen < 0 || precisionLen > 9) {
                precisionLen = 5;
            }
            try {
                return value.toFixed(precisionLen);
            } catch (e) {
                return defaultValue.toFixed(precisionLen);
            }
        }

        /**
         * Sample only one channel (which is defined in options)
         * @param {string} textureCoords valid GLSL vec2 object as string
         * @param {number} otherDataIndex index of the data in self.dataReference JSON array
         * @param {boolean} raw whether to output raw value from the texture (do not apply filters)
         * @return {string} code for appropriate texture sampling within the shader,
         *                  where only one channel is extracted or float with zero value if
         *                  the reference is not valid
         */
        sampleChannel(textureCoords, otherDataIndex = 0, raw = false) {
            // manualne zmenene pri pridavani podpory pre viac zdrojov
            // let refs = this.__shaderObject.dataReferences;
            let refs = [0];

            /* Array [ "rgba" ] */
            const chan = this.__channels[otherDataIndex];

            if (otherDataIndex >= refs.length) {
                switch (chan.length) {
                    case 1: return ".0";
                    case 2: return "vec2(.0)";
                    case 3: return "vec3(.0)";
                    default:
                        return 'vec4(0.0)';
                }
            }
            // return `osd_texture(${index}, ${vec2coords})`;
            let sampled = `${this.webglContext.sampleTexture(refs[otherDataIndex], textureCoords)}.${chan}`;
            if (raw) {
                return sampled;
            }
            return this.filter(sampled);

            // return sampled;
        }

        /**
         * For error detection, how many textures are available
         * @return {number} number of textures available
         */
        dataSourcesCount() {
            return this.__shaderObject.dataReferences.length;
        }

        /**
         * Load value, useful for controls value caching
         * @param {string} name value name
         * @param {string} defaultValue default value if no stored value available
         * @return {string} stored value or default value
         */
        loadProperty(name, defaultValue) {
            // console.log('loadProperty, key to cache =', name, 'defaultValue =', defaultValue, 'cache =', this._cache);
            const value = this._cache[name];
            const retval = value === undefined ? defaultValue : value;
            // console.log('loadProperty, retval =', retval);
            return retval;
        }

        /**
         * Store value, useful for controls value caching
         * @param {string} name value name
         * @param {string} value value
         */
        storeProperty(name, value) {
            this._cache[name] = value;
        }

        /**
         * Evaluates option flag, e.g. any value that indicates boolean 'true'
         * @param {*} value value to interpret
         * @return {boolean} true if the value is considered boolean 'true'
         */
        isFlag(value) {
            return value === "1" || value === true || value === "true";
        }

        isFlagOrMissing(value) {
            return value === undefined || this.isFlag(value);
        }

        /**
         * Get the mode we operate in
         * @return {string} mode
         */
        get mode() {
            return this._mode;
        }

        /**
         * Returns number of textures available to this shader
         * @return {number} number of textures available
         */
        get texturesCount() {
            // return this.__shaderObject.dataReferences.length;
            return 1; // uz jeden shader pre kazdy zdroj
        }

        /**
         * Set sampling channel
         * @param {object} options
         * @param {string} options.use_channel[X] "r", "g" or "b" channel to sample index X, default "r"
         */
        resetChannel(options) {
            // regex to compare with value used with use_channel, to check its correctness
            const channelPattern = new RegExp('[rgba]{1,4}');
            const parseChannel = (controlName, def, sourceDef) => {
                const predefined = this.constructor.defaultControls[controlName];

                if (options[controlName] || predefined) {
                    // console.log('idem aj cez if v resetchanelli', options[controlName], predefined);
                    /* ak je use_channel{i} v defaultControls, nastav podla toho channel (je, plainShader si ho tam prihodil pri definicii)
                        teda channel = "rgba" */
                    let channel = predefined ? (predefined.required ? predefined.required : predefined.default) : undefined;
                    if (!channel) {
                        /* pokial najde v this._cache controlName tak to vrati,
                            inak vrati options[controlName] ({}.controlName = undefined) */
                        channel = this.loadProperty(controlName, options[controlName]);
                    }

                    // (if channel is not defined) or (is defined and not string) or (is string and contains nowhere __channelPattern)
                    if (!channel || typeof channel !== "string" || channelPattern.exec(channel) === null) {
                        console.warn(`Invalid channel '${controlName}'. Will use channel '${def}'.`, channel, options);
                        // sets this.__visalisationLayer.cache[controlName] = "r";
                        this.storeProperty(controlName, def);
                        channel = def;
                    }

                    // sourceDef is object, has function acceptsChannelCount which returns boolean
                    if (!sourceDef.acceptsChannelCount(channel.length)) {
                        throw `${this.constructor.name()} does not support channel length ${channel.length} for channel: ${channel}`;
                    }

                    /* toto neviem ci nechces skor cekovat s pouzitim loadProperty ze co je v cachke */
                    if (channel !== options[controlName]) {
                        this.storeProperty(controlName, channel);
                    }
                    return channel;
                }
                return def;
            };

            /* source = { acceptsChannelCount: (x) => x === 4, description: "4d texture to render AS-IS" } */
            this.__channels = this.constructor.sources().map((source, i) => parseChannel(`use_channel${i}`, "r", source));
            /* nastavuje __channels = ["rgba"] */
            // console.log('this.__channels = ', this.__channels);
        }

        /**
         * Set blending mode.
         * @param {object} options
         * @param {string} options.use_mode blending mode to use: "show" or "mask" or "mask_clip"
         */
        /* options dojdu ako {} */
        resetMode(options) {
            if (!options) {
                options = this._customControls;
            }

            const predefined = this.constructor.defaultControls.use_mode;
            // if required, set mode to required
            this._mode = predefined && predefined.required;

            if (!this._mode) {
                if (options.use_mode) {
                    // firstly try to load from cache, if not in cache, use options.use_mode
                    if (!this._mode) {
                        this._mode = this.loadProperty("use_mode", options.use_mode);
                    }

                    // if mode was not in the cache and we got default value = options.use_mode, store it in the cache
                    if (this._mode === options.use_mode) {
                        this.storeProperty("use_mode", this._mode);
                    }
                } else {
                    this._mode = (predefined && predefined.default) || "show";
                }
            }

            // this.__mode is this._mode translated into its GLSL equivalent
            this.__mode = this.constructor.modes[this._mode];
        }


        /************************** FILTERING ****************************/
        /**
         * Can be used to re-set filters for a shader
         * @param {object} options filters configuration, currently supported are
         *  'use_gamma', 'use_exposure', 'use_logscale'
         */
        resetFilters(options) {
            if (!options) {
                options = this._customControls;
            }

            this.__scalePrefix = [];
            this.__scaleSuffix = [];
            for (let key in this.constructor.filters) {
                const predefined = this.constructor.defaultControls[key];
                let value = predefined ? predefined.required : undefined;
                if (value === undefined) {
                    if (options[key]) {
                        value = this.loadProperty(key, options[key]);
                    }
                    else {
                        value = predefined ? predefined.default : undefined;
                    }
                }

                if (value !== undefined) {
                    let filter = this.constructor.filters[key](value);
                    this.__scalePrefix.push(filter[0]);
                    this.__scaleSuffix.push(filter[1]);
                }
            }
            this.__scalePrefix = this.__scalePrefix.join("");
            this.__scaleSuffix = this.__scaleSuffix.reverse().join("");
        }

        /**
         * Apply global filters on value
         * @param {string} value GLSL code string, value to filter
         * @return {string} filtered value (GLSL oneliner without ';')
         */
        filter(value) {
            return `${this.__scalePrefix}${value}${this.__scaleSuffix}`;
        }

        /**
         * Set filter value
         * @param filter filter name
         * @param value value of the filter
         */
        setFilterValue(filter, value) {
            if (!this.constructor.filterNames[filter]) {
                console.error("Invalid filter name", filter);
                return;
            }
            this.storeProperty(filter, value);
        }

        /**
         * Get the filter value (alias for loadProperty(...)
         * @param {string} filter filter to read the value of
         * @param {string} defaultValue
         * @return {string} stored filter value or defaultValue if no value available
         */
        getFilterValue(filter, defaultValue) {
            return this.loadProperty(filter, defaultValue);
        }
        /************************** END OF FILTERING ****************************/


        /**
         *
         * @param {string} name the control named ID which will be attached to the control
         * @param {object} controlOptions control options defined by the underlying
         *  control, must have at least 'type' property
         */
        /* controlOptions dojdu ako {} */
        addControl(name, controlOptions) {
            if (this[name]) {
                console.warn(`Shader ${this.constructor.name()} overrides as a control name ${name} existing property!`);
            }

            // console.log('addControl, pred volanim UIControls.build');
            const controlObject = this.constructor.defaultControls[name];
            const control = $.WebGLModule.UIControls.build(this, name, controlObject, "uniqueID", controlOptions);

            // create new attribute to shaderLayer class -> shaderLayer.<control name> = <control object>
            // console.log('addControl nastavuje shaderu', this.constructor.name(), 'atribut s nazvom controlu', name);
            this[name] = control;
            this._ownedControls.push(name);
        }

        ////////////////////////////////////
        ////////// PRIVATE /////////////////
        ////////////////////////////////////

        // volane z konstruktora, vytvara controls podla defaultControls (this[controlname] = SimpleUIControl)
        /* options = {} */
        _buildControls(options) {
            let controls = this.constructor.defaultControls,
                customParams = this.constructor.customParams;

            // console.log('this.constructor.defaultControls = ', controls);
            for (let control in controls) {
                // console.log('som vo fori cez controls, control =', control);
                if (control.startsWith("use_")) {
                    continue;
                }

                let buildContext = controls[control];
                /* ak sa nachadza control v this.defaultControls */
                if (buildContext) {
                    // console.log('v prvom ife, control = ', control);
                    // creates this[control] = <SimpleUIControl>
                    this.addControl(control, options[control], buildContext);
                    continue;
                }

                let customContext = customParams[control];
                /* ak sa nachadza control v this.customParams, VOBEC SOM NEPRESIEL TUTO CAST */
                if (customContext) {
                    // console.log('v drugom ife');
                    let targetType;
                    const dType = typeof customContext.default,
                        rType = typeof customContext.required;
                    if (dType !== rType) {
                        console.error("Custom parameters for shader do not match!",
                            dType, rType, this.constructor.name());
                    }

                    if (rType !== 'undefined') {
                        targetType = rType;
                    } else if (dType !== 'undefined') {
                        targetType = dType;
                    } else {
                        targetType = 'object';
                    }

                    if (targetType === 'object') {
                        let knownOptions = options[control];
                        if (!knownOptions) {
                            knownOptions = options[control] = {};
                        }
                        if (customContext.default) {
                            $.extend(knownOptions, customContext.default);
                        }
                        if (options[control]) {
                            $.extend(knownOptions, options[control]);
                        }
                        if (customContext.required) {
                            $.extend(knownOptions, customContext.required);
                        }
                    } else {
                        if (customContext.required !== undefined) {
                            options[control] = customContext.required;
                        }
                        else if (options[control] === undefined) {
                            options[control] = customContext.default;
                        }
                    }
                }
            }
        }
    };

    /**
     * Declare supported controls by a particular shader,
     * each control defined this way is automatically created for the shader.
     *
     * Structure:
     * shaderLayer.defaultControls = {
     *     controlName: {
                   default: {type: <>, title: <>, default: <>, interactive: true|false, ...},
                   accepts: (type, instance) => <>,
                   required: {type: <>, ...} [OPTIONAL]
     *     }, ...
     * }
     *
     * use: controlId: false to disable a specific control (e.g. all shaders
     *  support opacity by default - use to remove this feature)
     *
     *
     * Additionally, use_[...] value can be specified, such controls enable shader
     * to specify default or required values for built-in use_[...] params. Example:
     * {
     *     use_channel0: {
     *         default: "bg"
     *     },
     *     use_channel1: {
     *         required: "rg"
     *     },
     *     use_gamma: {
     *         default: 0.5
     *     }
     * }
     * reads by default for texture 1 channels 'bg', second texture is always forced to read 'rg',
     * textures apply gamma filter with 0.5 by default if not overridden
     * todo: allow also custom object without structure being specified (use in custom manner,
     *  but limited in automated docs --> require field that summarises its usage)
     *
     * @member {object}
     */
    $.WebGLModule.ShaderLayer.defaultControls = {
        opacity: {
            default: {type: "range", default: 1, min: 0, max: 1, step: 0.1, title: "Opacity: "},
            accepts: (type, instance) => type === "float"
        }
    };

    /**
     * Declare custom parameters for documentation purposes.
     * Can set default values to provide sensible defaults.
     * Requires only 'usage' parameter describing the use.
     * Unlike controls, these values are not processed in any way.
     * Of course you don't have to define your custom parameters,
     * but then these won't be documented in any nice way. Note that
     * the value can be an object, or a different value (e.g., an array)
     * {
     *     customParamId: {
     *         default: {myItem: 1, myValue: "string" ...}, [OPTIONAL]
     *         usage: "This parameter can be used like this and that.",
     *         required: {type: <> ...} [OPTIONAL]
     *     }, ...
     * }
     * @type {any}
     */
    $.WebGLModule.ShaderLayer.customParams = {};

    /**
     * todo make blending more 'nice'
     * Available use_mode modes
     * @type {{show: string, mask: string}}
     */
    $.WebGLModule.ShaderLayer.modes = {};
    $.WebGLModule.ShaderLayer.modes["show"] = "show";
    $.WebGLModule.ShaderLayer.modes["mask"] = "blend";
    $.WebGLModule.ShaderLayer.modes["mask_clip"] = "blend_clip";

    /**
     * Parameter to save shaderLayer's functionality that can be shared and reused between shaderLayer instantions.
     */
    $.WebGLModule.ShaderLayer.__globalIncludes = {};

    //not really modular
    //add your filters here if you want... function that takes parameter (number)
    //and returns prefix and suffix to compute oneliner filter
    //should start as 'use_[name]' for namespace collision avoidance (params object)
    //expression should be wrapped in parenthesses for safety: ["(....(", ")....)"] in the middle the
    // filtered variable will be inserted, notice pow does not need inner brackets since its an argument...
    //note: pow avoided in gamma, not usable on vectors, we use pow(x, y) === exp(y*log(x))
    // TODO: implement filters as shader nodes instead!
    $.WebGLModule.ShaderLayer.filters = {};
    $.WebGLModule.ShaderLayer.filters["use_gamma"] = (x) => ["exp(log(", `) / ${$.WebGLModule.ShaderLayer.toShaderFloatString(x, 1)})`];
    $.WebGLModule.ShaderLayer.filters["use_exposure"] = (x) => ["(1.0 - exp(-(", `)* ${$.WebGLModule.ShaderLayer.toShaderFloatString(x, 1)}))`];
    $.WebGLModule.ShaderLayer.filters["use_logscale"] = (x) => {
        x = $.WebGLModule.ShaderLayer.toShaderFloatString(x, 1);
        return [`((log(${x} + (`, `)) - log(${x})) / (log(${x}+1.0)-log(${x})))`];
    };

    /**
     * Available filters (use_[name])
     * @type {{use_exposure: string, use_gamma: string, use_logscale: string}}
     */
    $.WebGLModule.ShaderLayer.filterNames = {};
    $.WebGLModule.ShaderLayer.filterNames["use_gamma"] = "Gamma";
    $.WebGLModule.ShaderLayer.filterNames["use_exposure"] = "Exposure";
    $.WebGLModule.ShaderLayer.filterNames["use_logscale"] = "Logarithmic scale";

    /* END OF SHADER LAYER */


    /**
     * Factory Manager for predefined UIControls
     *  - you can manage all your UI control logic within your shader implementation
     *  and not to touch this class at all, but here you will find some most common
     *  or some advanced controls ready to use, simple and powerful
     *  - registering an IComponent implementation (or an UiElement) in the factory results in its support
     *  among all the shaders (given the GLSL type, result of sample(...) matches).
     *  - UiElements are objects to create simple controls quickly and get rid of code duplicity,
     *  for more info @see OpenSeadragon.WebGLModule.UIControls.register()
     * @class OpenSeadragon.WebGLModule.UIControls
     */
    $.WebGLModule.UIControls = class {

        /**
         * Get all available control types
         * @return {string[]} array of available control types
         */
        static types() {
            return Object.keys(this._items).concat(Object.keys(this._impls));
        }

        /**
         * Get an element used to create simple controls, if you want
         * an implementation of the controls themselves (IControl), use build(...) to instantiate
         * @param {string} id type of the control
         * @return {*}
         */
        static getUiElement(id) {
            let ctrl = this._items[id];
            if (!ctrl) {
                console.error("Invalid control: " + id);
                ctrl = this._items["number"];
            }
            return ctrl;
        }

        /**
         * Get an element used to create advanced controls, if you want
         * an implementation of simple controls, use build(...) to instantiate
         * @param {string} id type of the control
         * @return {OpenSeadragon.WebGLModule.UIControls.IControl}
         */
        static getUiClass(id) {
            let ctrl = this._impls[id];
            if (!ctrl) {
                console.error("Invalid control: " + id);
                ctrl = this._impls["colormap"];
            }
            return ctrl;
        }

        /**
         * this._impls -> kluc je typ controlu, hodnota je trieda, ktora sa pouzije pri vytvarani controlu
         * Build UI control object based on given parameters
         * @param {OpenSeadragon.WebGLModule.ShaderLayer} owner owner of the control, shaderLayer
         * @param {string} controlName name used for the control (eg.: opacity)
         * @param {object} controlObject object from shaderLayer.defaultControls, defines control
         * @param {string} controlId
         * @param {object|*} customParams parameters passed to the control (defined by the control) or set as default value if not object ({})
         * @return {OpenSeadragon.WebGLModule.UIControls.IControl}
         */
        static build(owner, controlName, controlObject, controlId, customParams = {}) {
            let defaultParams = controlObject.default,
                accepts = controlObject.accepts,
                requiredParams = controlObject.required === undefined ? {} : controlObject.required;

            let interactivityEnabled = owner._hasInteractiveControls;

            // if not an object, but a value, make it the default one
            if (!(typeof customParams === 'object')) {
                customParams = {default: customParams};
            }
            //must be false if HTML nodes are not managed
            if (!interactivityEnabled) {
                customParams.interactive = false;
            }

            let originalType = defaultParams.type;

            // merge dP < cP < rP recursively with rP having the biggest overwriting priority, without modifying the original objects
            const params = $.extend(true, {}, defaultParams, customParams, requiredParams);
            console.warn('params =', params);

            // if control's type (eg.: opacity -> range) not present in this._items
            /* VOBEC SOM NEPRESIEL TUTO CAST */
            if (!this._items[params.type]) {
                const controlType = params.type;
                console.debug('UIControls:build - if vetva, typ =', controlType, 'neni v UIControls._items');
                console.debug('UIControls:build - if vetva, this._impls =', this._impls);

                // if cannot use the new control type, try to use the default one
                if (!this._impls[controlType]) {
                    return this._buildFallback(controlType, originalType, owner, controlName, controlObject, params);
                }

                /* Toz toto robi nieco divne pretoze to cucia uz z Jirkovho pluginu, cize neviem presne co to robi.
                Ale myslel som ze to ma vytvorit jeden control a ked si vypisujem iba ze prechod konstruktormi SIMPLE a ICONTROL
                tak to vyzera ako by sa tym riadkom cls =... robil jeden control viac raz co neviem preco. */
                console.debug('Vytvaram custom control implementaciu');
                let cls = new this._impls[controlType](owner, controlName, controlId, params);
                console.debug('Vytvoril som custom control implementaciu');

                if (accepts(cls.type, cls)) {
                    console.debug('Idem pouzit custom control implementaciu');
                    return cls;
                }

                // cannot built with custom implementation, try to build with default one
                console.debug('Nejde pouzit vytvorenu custom control implementaciu, vyskusam defaultnu.');
                return this._buildFallback(controlType, originalType, owner, controlName, controlObject, params);

            } else { // control's type (eg.: range/number/...) is defined in this._items
                console.debug('UIControls:build - typ controlu je definovany v UIControls._items.');
                let intristicComponent = this.getUiElement(params.type);
                let comp = new $.WebGLModule.UIControls.SimpleUIControl(
                    owner, controlName, controlId, params, intristicComponent
                );
                /* comp.type === float, tuto naozaj pri range v _items je definovany type: float */

                if (accepts(comp.type, comp)) {
                    return comp;
                }
                return this._buildFallback(intristicComponent.glType, originalType,
                    owner, controlName, controlObject, params);
            }
        }

        static _buildFallback(newType, originalType, owner, controlName, controlObject, customParams) {
            //repeated check when building object from type

            customParams.interactive = false;
            if (originalType === newType) { //if default and new equal, fail - recursion will not help
                console.error(`Invalid parameter in shader '${customParams.type}': the parameter could not be built.`);
                return undefined;
            } else { //otherwise try to build with originalType (default)
                customParams.type = originalType;
                console.warn("Incompatible UI control type '" + newType + "': making the input non-interactive.");
                return this.build(owner, controlName, controlObject, customParams);
            }
        }

        /**
         * Register simple UI element by providing necessary object
         * implementation:
         *  { defaults: function() {...}, // object with all default values for all supported parameters
              html: function(uniqueId, params, css="") {...}, //how the HTML UI controls look like
              glUniformFunName: function() {...}, //what function webGL uses to pass this attribute to GPU
              decode: function(fromValue) {...}, //parse value obtained from HTML controls into something
                                                    gl[glUniformFunName()](...) can pass to GPU
              glType: //what's the type of this parameter wrt. GLSL: int? vec3?
         * @param type the identifier under which is this control used: lookup made against params.type
         * @param uiElement the object to register, fulfilling the above-described contract
         */
        static register(type, uiElement) {
            function check(el, prop, desc) {
                if (!el[prop]) {
                    console.warn(`Skipping UI control '${type}' due to '${prop}': missing ${desc}.`);
                    return false;
                }
                return true;
            }

            if (check(uiElement, "defaults", "defaults():object") &&
                check(uiElement, "html", "html(uniqueId, params, css):htmlString") &&
                check(uiElement, "glUniformFunName", "glUniformFunName():string") &&
                check(uiElement, "decode", "decode(encodedValue):<compatible with glType>") &&
                check(uiElement, "normalize", "normalize(value, params):<typeof value>") &&
                check(uiElement, "sample", "sample(value, valueGlType):glslString") &&
                check(uiElement, "glType", "glType:string")
            ) {
                uiElement.prototype.getName = () => type;
                if (this._items[type]) {
                    console.warn("Registering an already existing control component: ", type);
                }
                uiElement["uiType"] = type;
                this._items[type] = uiElement;
            }
        }

        /**
         * Register class as a UI control
         * @param {string} type unique control name / identifier
         * @param {OpenSeadragon.WebGLModule.UIControls.IControl} cls to register, implementation class of the controls
         */
        static registerClass(type, cls) {
            //todo not really possible with syntax checker :/
            // if ($.WebGLModule.UIControls.IControl.isPrototypeOf(cls)) {
                cls.prototype.getName = () => type;

                if (this._items[type]) {
                    console.warn("Registering an already existing control component: ", type);
                }
                cls._uiType = type;
                this._impls[type] = cls;
            // } else {
            //     console.warn(`Skipping UI control '${type}': does not inherit from $.WebGLModule.UIControls.IControl.`);
            // }
        }
    };

    //definitions of possible control's types -> kazdy shader ma definovane dake controls a podla ich type: sa niektory shit z tadeto prideli do SimpleUIControl.componentco ty
    //simple functionality
    // intristic component for SimpleUIControl
    $.WebGLModule.UIControls._items = {
        number: {
            defaults: function() {
                return {title: "Number", interactive: true, default: 0, min: 0, max: 100, step: 1};
            },
            // returns string corresponding to html injection
            html: function(uniqueId, params, css = "") {
                let title = params.title ? `<span> ${params.title}</span>` : "";
                return `${title}<input class="form-control input-sm" style="${css}" min="${params.min}" max="${params.max}"
    step="${params.step}" type="number" id="${uniqueId}">`;
            },
            glUniformFunName: function() {
                return "uniform1f";
            },
            decode: function(fromValue) {
                return Number.parseFloat(fromValue);
            },
            normalize: function(value, params) {
                return (value - params.min) / (params.max - params.min);
            },
            sample: function(name, ratio) {
                return name;
            },
            glType: "float",
            uiType: "number"
        },

        range: {
            defaults: function() {
                return {title: "Range", interactive: true, default: 0, min: 0, max: 100, step: 1};
            },
            html: function(uniqueId, params, css = "") {
                let title = params.title ? `<span> ${params.title}</span>` : "";
                return `${title}<input type="range" style="${css}"
    class="with-direct-input" min="${params.min}" max="${params.max}" step="${params.step}" id="${uniqueId}">`;
            },
            glUniformFunName: function() {
                return "uniform1f";
            },
            decode: function(fromValue) {
                return Number.parseFloat(fromValue);
            },
            normalize: function(value, params) {
                return (value - params.min) / (params.max - params.min);
            },
            sample: function(name, ratio) {
                return name;
            },
            glType: "float",
            uiType: "range"
        },

        color: {
            defaults: function() {
                return { title: "Color", interactive: true, default: "#fff900" };
            },
            html: function(uniqueId, params, css = "") {
                let title = params.title ? `<span> ${params.title}</span>` : "";
                return `${title}<input type="color" id="${uniqueId}" style="${css}" class="form-control input-sm">`;
            },
            glUniformFunName: function() {
                return "uniform3fv";
            },
            decode: function(fromValue) {
                try {
                    let index = fromValue.startsWith("#") ? 1 : 0;
                    return [
                        parseInt(fromValue.slice(index, index + 2), 16) / 255,
                        parseInt(fromValue.slice(index + 2, index + 4), 16) / 255,
                        parseInt(fromValue.slice(index + 4, index + 6), 16) / 255
                    ];
                } catch (e) {
                    return [0, 0, 0];
                }
            },
            normalize: function(value, params) {
                return value;
            },
            sample: function(name, ratio) {
                return name;
            },
            glType: "vec3",
            uiType: "color"
        },

        bool: {
            defaults: function() {
                return { title: "Checkbox", interactive: true, default: true };
            },
            html: function(uniqueId, params, css = "") {
                let title = params.title ? `<span> ${params.title}</span>` : "";
                let value = this.decode(params.default) ? "checked" : "";
                //note a bit dirty, but works :) - we want uniform access to 'value' property of all inputs
                return `${title}<input type="checkbox" style="${css}" id="${uniqueId}" ${value}
    class="form-control input-sm" onchange="this.value=this.checked; return true;">`;
            },
            glUniformFunName: function() {
                return "uniform1i";
            },
            decode: function(fromValue) {
                return fromValue && fromValue !== "false" ? 1 : 0;
            },
            normalize: function(value, params) {
                return value;
            },
            sample: function(name, ratio) {
                return name;
            },
            glType: "bool",
            uiType: "bool"
        }
    };

    //implementation of UI control classes
    //more complex functionality
    $.WebGLModule.UIControls._impls = {
        //colormap: $.WebGLModule.UIControls.ColorMap
    };

    /**
     * @interface
     */
    $.WebGLModule.UIControls.IControl = class {

        /**
         * Sets common properties needed to create the controls:
         *  this.context @extends WebGLModule.ShaderLayer - owner context
         *  this.name - name of the parameter for this.context.[load/store]Property(...) call
         *  this.id - unique ID for HTML id attribute, to be able to locate controls in DOM,
         *      created as ${uniq}${name}-${context.uid}
         *  this.webGLVariableName - unique webgl uniform variable name, to not to cause conflicts
         *
         * If extended (class-based definition, see registerCass) children should define constructor as
         *
         * @example
         *   constructor(context, name, webGLVariableName, params) {
         *       super(context, name, webGLVariableName);
         *       ...
         *       //possibly make use of params:
         *       this.params = this.getParams(params);
         *
         *       //now access params:
         *       this.params...
         *   }
         *
         * @param {ShaderLayer} owner shader context owning this control
         * @param {string} name name of the control (key to the params in the shader configuration)
         * @param {string} uniq another element to construct the DOM id from, mostly for compound controls
         */
        constructor(owner, name, id, uniq = "") {
            console.debug('V konstruktori IControlu, owner=', owner.constructor.name(), 'name=', name, 'id=', id);
            this.owner = owner;
            this.name = name;
            // this.id = `${uniq}${name}-${owner.uid}`;
            this.id = id;
            this.webGLVariableName = `${name}_${owner.uid}`;
            this._params = {};
            this.__onchange = {};
        }

        /**
         * Safely sets outer params with extension from 'supports'
         *  - overrides 'supports' values with the correct type (derived from supports or supportsAll)
         *  - sets 'supports' as defaults if not set
         * @param params
         */
        getParams(params) {
            const t = this.constructor.getVarType;
            function mergeSafeType(mask, from, possibleTypes) {
                const to = Object.assign({}, mask);
                Object.keys(from).forEach(key => {
                    const tVal = to[key],
                        fVal = from[key],
                        tType = t(tVal),
                        fType = t(fVal);

                    const typeList = possibleTypes ? possibleTypes[key] : undefined,
                        pTypeList = typeList ? typeList.map(x => t(x)) : [];

                    //our type detector distinguishes arrays and objects
                    if (tVal && fVal && tType === "object" && fType === "object") {
                        to[key] = mergeSafeType(tVal, fVal, typeList);
                    } else if (tVal === undefined || tType === fType || pTypeList.includes(fType)) {
                        to[key] = fVal;
                    } else if (fType === "string") {
                        //try parsing NOTE: parsing from supportsAll is ignored!
                        if (tType === "number") {
                            const parsed = Number.parseFloat(fVal);
                            if (!Number.isNaN(parsed)) {
                                to[key] = parsed;
                            }
                        } else if (tType === "boolean") {
                            const value = fVal.toLowerCase();
                            if (value === "false") {
                                to[key] = false;
                            }
                            if (value === "true") {
                                to[key] = true;
                            }
                        }
                    }
                });
                // console.log('to = ', to);
                return to;
            }

            // console.log('const t =', t);
            // console.log('this.supports.all', this.supportsAll);
            // console.log('this.supports = ', this.supports);
            // console.log('realne idem aj cez getParams, inak do params doslo: ', params);
            /* params = Object { type: "range", default: 1, min: 0, max: 1, step: 0.1, title: "Opacity: ", interactive: false } */
            /* supports = Object { title: "Range", interactive: true, default: 0, min: 0, max: 100, step: 1 } */
            return mergeSafeType(this.supports, params, this.supportsAll);
        }

        /**
         * Safely check certain param value
         * @param value  value to check
         * @param defaultValue default value to return if check fails
         * @param paramName name of the param to check value type against
         * @return {boolean|number|*}
         */
        getSafeParam(value, defaultValue, paramName) {
            const t = this.constructor.getVarType;
            function nest(suppNode, suppAllNode) {
                if (t(suppNode) !== "object") {
                    return [suppNode, suppAllNode];
                }
                if (!suppNode[paramName]) {
                    return [undefined, undefined];
                }
                return nest(suppNode[paramName], suppAllNode ? suppAllNode[paramName] : undefined);
            }
            const param = nest(this.supports, this.supportsAll),
                tParam = t(param[0]);

            if (tParam === "object") {
                console.warn("Parameters should not be stored at object level. No type inspection is done.");
                return true; //no supported inspection
            }
            const tValue = t(value);
            //supported type OR supports all types includes the type
            if (tValue === tParam || (param[1] && param[1].map(t).includes(tValue))) {
                return value;
            }

            if (tValue === "string") {
                //try parsing NOTE: parsing from supportsAll is ignored!
                if (tParam === "number") {
                    const parsed = Number.parseFloat(value);
                    if (!Number.isNaN(parsed)) {
                        return parsed;
                    }
                } else if (tParam === "boolean") {
                    const val = value.toLowerCase();
                    if (val === "false") {
                        return false;
                    }
                    if (val === "true") {
                        return true;
                    }
                }
            }

            // HINT was uncommented by Jirka, este som sa sem nedostal aby som vedel co to ma robit
            //console.debug("Failed to load safe param -> new feature, debugging! ", value, defaultValue, paramName);
            return defaultValue;
        }

        /**
         * Uniform behaviour wrt type checking in shaders
         * @param x
         * @return {string}
         */
        static getVarType(x) {
            if (x === undefined) {
                return "undefined";
            }
            if (x === null) {
                return "null";
            }
            return Array.isArray(x) ? "array" : typeof x;
        }

        /**
         * JavaScript initialization
         *  - read/store default properties here using this.context.[load/store]Property(...)
         *  - work with own HTML elements already attached to the DOM
         *      - set change listeners, input values!
         */
        init() {
            throw "WebGLModule.UIControls.IControl::init() must be implemented.";
        }

        /**
         * TODO: improve overall setter API
         * Allows to set the control value programatically.
         * Does not trigger canvas re-rednreing, must be done manually (e.g. control.context.invalidate())
         * @param encodedValue any value the given control can support, encoded
         *  (e.g. as the control acts on the GUI - for input number of
         *    values between 5 and 42, the value can be '6' or 6 or 6.15
         */
        set(encodedValue) {
            throw "WebGLModule.UIControls.IControl::set() must be implemented.";
        }

        /**
         * Called when an image is rendered
         * @param {WebGLProgram} program
         * @param {WebGLRenderingContext|WebGL2RenderingContext} gl
         */
        glDrawing(program, gl) {
            //the control should send something to GPU
            throw "WebGLModule.UIControls.IControl::glDrawing() must be implemented.";
        }

        /**
         * Called when associated webgl program is switched to
         * @param {WebGLProgram} program
         * @param {WebGLRenderingContext|WebGL2RenderingContext} gl
         */
        glLoaded(program, gl) {
            //the control should send something to GPU
            throw "WebGLModule.UIControls.IControl::glLoaded() must be implemented.";
        }

        /**
         * Get the UI HTML controls
         *  - these can be referenced in this.init(...)
         *  - should respect this.params.interactive attribute and return non-interactive output if interactive=false
         *      - don't forget to no to work with DOM elements in init(...) in this case
         *
         * todo: when overrided value before 'init' call on params, toHtml was already called, changes might not get propagated
         *  - either: delay toHtml to trigger insertion later (not nice)
         *  - do not allow changes before init call, these changes must happen at constructor
         */
        toHtml(breakLine = true, controlCss = "") {
            throw "WebGLModule.UIControls.IControl::toHtml() must be implemented.";
        }

        /**
         * Handles how the variable is being defined in GLSL
         *  - should use variable names derived from this.webGLVariableName
         */
        define() {
            throw "WebGLModule.UIControls.IControl::define() must be implemented.";
        }

        /**
         * Sample the parameter using ratio as interpolation, must be one-liner expression so that GLSL code can write
         *    `vec3 mySampledValue = ${this.color.sample("0.2")};`
         * NOTE: you can define your own global-scope functions to keep one-lined sampling,
         * see this.context.includeGlobalCode(...)
         * @param {(string|undefined)} value openGL value/variable, used in a way that depends on the UI control currently active
         *        (do not pass arguments, i.e. 'undefined' just get that value, note that some inputs might require you do it..)
         * @param {string} valueGlType GLSL type of the value
         * @return {string} valid GLSL oneliner (wihtout ';') for sampling the value, or invalid code (e.g. error message) to signal error
         */
        sample(value = undefined, valueGlType = 'void') {
            throw "WebGLModule.UIControls.IControl::sample() must be implemented.";
        }

        /**
         * Parameters supported by this UI component, must contain at least
         *  - 'interactive' - type bool, enables and disables the control interactivity
         *  (by changing the content available when rendering html)
         *  - 'title' - type string, the control title
         *
         *  Additionally, for compatibility reasons, you should, if possible, define
         *  - 'default' - type any; the default value for the particular control
         * @return {{}} name: default value mapping
         */
        get supports() {
            throw "WebGLModule.UIControls.IControl::supports must be implemented.";
        }

        /**
         * Type definitions for supports. Can return empty object. In case of missing
         * type definitions, the type is derived from the 'supports()' default value type.
         *
         * Each key must be an array of default values for the given key if applicable.
         * This is an _extension_ to the supports() and can be used only for keys that have more
         * than one default type applicable
         * @return {{}}
         */
        get supportsAll() {
            throw "WebGLModule.UIControls.IControl::typeDefs must be implemented.";
        }

        /**
         * GLSL type of this control: what type is returned from this.sample(...) ?
         * @return {string}
         */
        get type() {
            throw "WebGLModule.UIControls.IControl::type must be implemented.";
        }

        /**
         * Raw value sent to the GPU, note that not necessarily typeof raw() === type()
         * some controls might send whole arrays of data (raw) and do smart sampling such that type is only a number
         * @return {any}
         */
        get raw() {
            throw "WebGLModule.UIControls.IControl::raw must be implemented.";
        }

        /**
         * Encoded value as used in the UI, e.g. a name of particular colormap, or array of string values of breaks...
         * @return {any}
         */
        get encoded() {
            throw "WebGLModule.UIControls.IControl::encoded must be implemented.";
        }

        //////////////////////////////////////
        //////// COMMON API //////////////////
        //////////////////////////////////////

        /**
         * The control type component was registered with. Handled internally.
         * @return {*}
         */
        get uiControlType() {
            return this.constructor._uiType;
        }

        /**
         * Get current control parameters
         * the control should set the value as this._params = this.getParams(incomingParams);
         * @return {{}}
         */
        get params() {
            return this._params;
        }

        /**
         * Automatically overridden to return the name of the control it was registered with
         * @return {string}
         */
        getName() {
            return "IControl";
        }

        /**
         * Load a value from cache to support its caching - should be used on all values
         * that are available for the user to play around with and change using UI controls
         *
         * @param defaultValue value to return in case of no cached value
         * @param paramName name of the parameter, must be equal to the name from 'supports' definition
         *  - default value can be empty string
         * @return {*} cached or default value
         */
        load(defaultValue, paramName = "") {
            const value = this.owner.loadProperty(this.name + (paramName === "default" ? "" : paramName), defaultValue);
            return value;

            // TODO: check this
            //check param in case of input cache collision between shader types
            // return this.getSafeParam(value, defaultValue, paramName === "" ? "default" : paramName);
        }

        /**
         * Store a value from cache to support its caching - should be used on all values
         * that are available for the user to play around with and change using UI controls
         *
         * @param value to store
         * @param paramName name of the parameter, must be equal to the name from 'supports' definition
         *  - default value can be empty string
         */
        store(value, paramName = "") {
            if (paramName === "default") {
                paramName = "";
            }
            this.owner.storeProperty(this.name + paramName, value);
        }

        /**
         * On parameter change register self
         * @param {string} event which event to fire on
         *  - events are with inputs the names of supported parameters (this.supports), separated by dot if nested
         *  - most controls support "default" event - change of default value
         *  - see specific control implementation to see what events are fired (Advanced Slider fires "breaks" and "mask" for instance)
         * @param {function} clbck(rawValue, encodedValue, context) call once change occurs, context is the control instance
         */
        on(event, clbck) {
            this.__onchange[event] = clbck; //only one possible event -> rewrite?
        }

        /**
         * Clear events of the event type
         * @param {string} event type
         */
        off(event) {
            delete this.__onchange[event];
        }

        /**
         * Clear ALL events
         */
        clearEvents() {
            this.__onchange = {};
        }

        /**
         * Invoke changed value event
         *  -- should invoke every time a value changes !driven by USER!, and use unique or compatible
         *     event name (event 'value') so that shader knows what changed
         * @param event event to call
         * @param value decoded value of encodedValue
         * @param encodedValue value that was received from the UI input
         * @param context self reference to bind to the callback
         */
        changed(event, value, encodedValue, context) {
            if (typeof this.__onchange[event] === "function") {
                this.__onchange[event](value, encodedValue, context);
            }
        }

        /**
         * Create cache object to store this control's values.
         * @returns {object}
         */
        createCacheObject() {
            this._cache = {
                encodedValue: this.encoded,
                value: this.raw
            };
            return this._cache;
        }

        /**
         *
         * @param {object} cache object to serve as control's cache
         */
        loadCacheObject(cache) {
            this._cache = cache;
            this.set(cache.encodedValue);
        }

        /**
         * Create HTML DOM element bind to this control.
         * @param {HTMLElement} parentElement html element into which should this control's html code be placed into
         * @returns {HTMLElement} this control's html element
         */
        createDOMElement(parentElement) {
            const html = this.toHtml(true);
            // console.log('createDOMElement, html injection =', html);
            if (!html) {
                console.info(`Control ${this.name} failed to create HTML element. Should it ?`);
                return null;
            }

            // this should create element in the DOM with this.id as the id of the element
            parentElement.insertAdjacentHTML('beforeend', html);
            this._htmlDOMElement = document.getElementById(this.id);
            this._htmlDOMElement.setAttribute('value', this.encodedValue);

            // call to this.toHtml(true) returns html elements for control wrapped in one more <div> element,
            // this element is now pointed onto with this._htmlDOMParentContainer
            this._htmlDOMParentContainer = this._htmlDOMElement.parentElement;

            return this._htmlDOMElement;
        }

        registerDOMElementEventHandler(functionToCall) {
            const _this = this;
            const node = document.getElementById(this.id);
            if (!node) {
                console.error('registerDOMElementEventHandler: HTML element not found, id =', this.id);
                return;
            }

            node.setAttribute('value', this.encodedValue);

            let handler = function(e) {
                // console.info('from event handler, calling set on control with value =', e.target.value, '.');
                node.setAttribute('value', e.target.value);
                _this.set(e.target.value);
                functionToCall();
            };
            node.addEventListener('change', handler);
        }

        destroy() {
            if (this._htmlDOMElement) {
                this._htmlDOMElement.remove();
                this._htmlDOMParentContainer.remove();
            }

            // maybe something more??
        }
    };


    /**
     * Generic UI control implementations
     * used if:
     * {
     *     type: "CONTROL TYPE",
     *     ...
     * }
     *
     * The subclass constructor should get the context reference, the name
     * of the input and the parametrization.
     *
     * Further parameters passed are dependent on the control type, see
     * @ WebGLModule.UIControls
     *
     * @class WebGLModule.UIControls.SimpleUIControl
     */
    $.WebGLModule.UIControls.SimpleUIControl = class extends $.WebGLModule.UIControls.IControl {

        /**
         *
         * @param {ShaderLayer} owner owner of the control (shaderLayer)
         * @param {string} name name of the control (eg. "opacity")
         * @param {string} id unique control's id, corresponds to it's DOM's element's id
         * @param {object} params
         * @param {object} intristicComponent control's object from UIControls._items, keyed with it's params.default.type?
         */
        //uses intristicComponent that holds all specifications needed to work with the component uniformly
        constructor(owner, name, id, params, intristicComponent) {
            console.debug('V konstruktori SimpleUIControlu, owner=', owner.constructor.name(), 'name=', name, 'id=', id, 'params=', params, 'intristicComp=', intristicComponent);
            super(owner, name, id);
            this.component = intristicComponent;
            // do _params da params s urcenym poradim properties (asi)
            this._params = this.getParams(params);
        }

        /**
         * do encodedvalue nastavi default hodnotu aku ma control definovanu v jsone jemu odpovedajucom
         * do value da vypocitanu (z jsonu) uz finalnu hodnotu ktora sa bude posielat do glsl
         */
        init() {
            this.encodedValue = this.load(this.params.default);
            // nothing was stored in the cache so we got the default value from the load call => store the value in the cache
            if (this.encodedValue === this.params.default) {
                this.store(this.encodedValue);
            }


            // did not know why this is here so I just commented it out
            // this unfortunatelly makes cache erasing and rebuilding vis impossible, the shader part has to be fully re-instantiated
            // this.params.default = this.encodedValue;

            // najprv dekoduje encodedValue, pri color to znamena napriklad ze zo stringu #ffffff sa prevedie na array troch floatov, pre range ze proste parse float na vstupe
            // potom normalizuje, co pri farbe nerobi nic ale napriklad pri range to uz nejakym sposobom dostava do rozmedzia <0, 1> s tym ze napriklad ak min je 0 a max 100 a default hodnota 40 tak hodnotu
            // tomu da 0.4, asi chapes, nech to sedi s originalom, klasicky ako v statistike ze vzdialenosti ostanu rovnake, hodnota je default hodnota a hranice intervalu su min a max v json definicii
            this.value = this.component.normalize(this.component.decode(this.encodedValue), this.params);

            // console.error(`UIControl ${this.name} INIT() -> value without normalizing`, this.component.decode(this.encodedValue));
            // console.error(`UIControl ${this.name} INIT() -> sets its value to ${this.value}`);

            // console.log('UIControl::init() - setting value to', this.value, 'encodedValue =', this.encodedValue, 'interactive= ', this.params.interactive);
            if (this.params.interactive) {
                const _this = this;
                let node = document.getElementById(this.id);
                if (node) {
                    let updater = function(e) {
                        _this.set(e.target.value);
                        _this.owner.invalidate();
                    };

                    // TODO: some elements do not have 'value' attribute, but 'checked' or 'selected' instead
                    // console.log('Setting node.value to', this.encodedValue);
                    node.value = this.encodedValue;
                    node.addEventListener('change', updater);
                } else {
                    console.error('UIControl::init() - HTML element not found, id =', this.id);
                }
            }
        }

        set(encodedValue) {
            // console.warn('control\'s set call, value =', encodedValue);
            this.encodedValue = encodedValue;
            this.value = this.component.normalize(this.component.decode(this.encodedValue), this.params);

            // zmenil sa params.default, posledne zaregistrovany handler na tuto zmenu sa zavola..
            this.changed("default", this.value, this.encodedValue, this);

            // bud alebo
            this.store(this.encodedValue);
            // this._cache.encodedValue = this.encodedValue;
            // this._cache.value = this.value;
        }

        glDrawing(program, gl) {
            // console.log('Settujem', this.component.glUniformFunName(), 'odpovedajuci', this.webGLVariableName, 'na', this.value);
            gl[this.component.glUniformFunName()](this.glLocation, this.value);
        }

        glLoaded(program, gl) {
            // console.log(`setting this.glLocation to ${this.webGLVariableName}`);
            this.glLocation = gl.getUniformLocation(program, this.webGLVariableName);
        }

        // POZRIET
        toHtml(breakLine = true, controlCss = "") {
            // if (!this.params.interactive) {
            //     return "";
            // }
            // console.log('toHtml, componenr =', this.component);
            const result = this.component.html(this.id, this.params, controlCss);
            return breakLine ? `<div>${result}</div>` : result;
        }

        define() {
            return `uniform ${this.component.glType} ${this.webGLVariableName};`;
        }

        sample(value = undefined, valueGlType = 'void') {
            if (!value || valueGlType !== 'float') {
                return this.webGLVariableName;
            }
            return this.component.sample(this.webGLVariableName, value);
        }

        get uiControlType() {
            return this.component["uiType"];
        }

        get supports() {
            return this.component.defaults();
        }

        get supportsAll() {
            return {};
        }

        get raw() {
            return this.value;
        }

        get encoded() {
            return this.encodedValue;
        }

        get type() {
            return this.component.glType;
        }
    };
    })(OpenSeadragon);

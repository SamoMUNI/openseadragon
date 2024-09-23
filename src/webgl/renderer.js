// 900 riadkov

(function($) {


    /**
     * Wrapping the funcionality of WebGL to be suitable for tile processing and rendering.
     * Written by Aiosa
     * @class OpenSeadragon.WebGLModule
     * @memberOf OpenSeadragon
     */
    $.WebGLModule = class extends $.EventSource {
        /**
         * @typedef {{
         *  name?: string,
         *  lossless?: boolean,
         *  shaders: Object.<string, OpenSeadragon.WebGLModule.ShaderLayerConfig>
         * }} OpenSeadragon.WebGLModule.RenderingConfig
         *
         * //use_channel[X] name
         * @template {Object<string,any>} TUseChannel
         * //use_[fitler_name]
         * @template {Object<string,number>} TUseFilter
         * @template {Object<string,(string|any)>} TIControlConfig
         * @typedef OpenSeadragon.WebGLModule.ShaderLayerParams
         * @type {{TUseChannel,TUseFilter,TIControlConfig}}
         *
         * @typedef {{
         *   name?: string,
         *   type: string,
         *   visible?: boolean,
         *   dataReferences: number[],
         *   params?: OpenSeadragon.WebGLModule.ShaderLayerParams,
         *  }} OpenSeadragon.WebGLModule.ShaderLayerConfig
         *
         *
         * @typedef OpenSeadragon.WebGLModule.UIControlsRenderer
         * @type function
         * @param {string} title
         * @param {string} html
         * @param {string} dataId
         * @param {boolean} isVisible
         * @param {OpenSeadragon.WebGLModule.ShaderLayer} layer
         * @param {boolean} wasErrorWhenLoading
         */


        /**
         * @constructor
         * @param {object} incomingOptions
         * @param {string} incomingOptions.uniqueId
         * @param {string} incomingOptions.webglPreferredVersion prefered WebGL version, for now "1.0" or "2.0"
         * @param {object} incomingOptions.webglOptions
         * @param {object} incomingOptions.canvasOptions
         * @param {string} incomingOptions.htmlControlsId where to render html controls
         * @param {OpenSeadragon.WebGLModule.UIControlsRenderer} incomingOptions.htmlShaderPartHeader function that generates particular layer HTML
         * @param {function} incomingOptions.ready function called when ready
         * @param {function} incomingOptions.resetCallback function called when user input changed, e.g. changed output of the current rendering
         * signature f({WebGLModule.VisualizationConfig} oldVisualisation,{WebGLModule.VisualizationConfig} newVisualisation)
         * @param {boolean} incomingOptions.debug debug mode default false
         */
        constructor(incomingOptions) {
            super();
            console.log('Robim renderer, options=', incomingOptions);

            if (!this.constructor.idPattern.test(incomingOptions.uniqueId)) {
                throw "$.WebGLModule::constructor: invalid ID! Id can contain only letters, numbers and underscore. ID: " + incomingOptions.uniqueId;
            }

            this.uniqueId = incomingOptions.uniqueId;
            this.webglPreferredVersion = incomingOptions.webglPreferredVersion;
            this.webglOptions = incomingOptions.webglOptions;
            this.canvasOptions = incomingOptions.canvasOptions;
            this.htmlControlsId = incomingOptions.htmlControlsId;
            this.htmlShaderPartHeader = incomingOptions.htmlShaderPartHeader;
            this.ready = incomingOptions.ready;
            this.resetCallback = incomingOptions.resetCallback;
            this.debug = incomingOptions.debug;

            this.visualisationReady = (i, visualisation) => { }; // called once a visualisation is compiled and linked (might not happen) [spec + program + shaders ready I guess]
            this.running = false; // correctly running using some valid specification

            this._initialized = false; // init was called
            this._program = -1; // number, index of WebGLProgram currently being used
            this._programs = {}; // {number: WebGLProgram}, WebGLPrograms indexed with numbers
            this._programSpecifications = []; // [object], array of specification objects, index of specification corresponds to index of WebGLProgram created from that specification in _programs

            this.shadersCounter = {}; // {identity: <num of tiledImages using identity>, edge: <num of tiledImages using edges>}

            this._dataSources = [];
            this._origDataSources = [];

            this.defaultRenderingSpecification = null; // object, set in createSingePassShader
            this.buildOptions = null; // object, set in createSingePassShader

            // set the webgl attributes
            this.gl = null; // WebGLRenderingContext|WebGL2RenderingContext
            this.webglContext = null; // $.WebGLModule.WebGLImplementation
            try {
                const canvas = document.createElement("canvas");

                const WebGLImplementation = this.constructor.determineContext(this.webglPreferredVersion);

                const WebGLRenderingContext = WebGLImplementation && WebGLImplementation.create(canvas, this.canvasOptions);

                if (WebGLRenderingContext) {
                    const readGlProp = (prop, defaultValue) => {
                        if (this.webglOptions[prop] !== undefined) {
                            return WebGLRenderingContext[this.webglContext[prop]] || WebGLRenderingContext[defaultValue];
                        }
                        return WebGLRenderingContext[defaultValue];
                    };
                    /**
                     * @param {object} options
                     * @param {string} options.wrap  texture wrap parameteri
                     * @param {string} options.magFilter  texture filter parameteri
                     * @param {string} options.minFilter  texture filter parameteri
                     */
                    const options = {
                        wrap: readGlProp("wrap", "MIRRORED_REPEAT"),
                        minFilter: readGlProp("minFilter", "LINEAR"),
                        magFilter: readGlProp("magFilter", "LINEAR"),
                    };

                    // set the attributes
                    this.gl = WebGLRenderingContext;
                    this.webglContext = new WebGLImplementation(this, WebGLRenderingContext, options);

                } else {
                    throw new Error("$.WebGLModule::constructor: Could not create WebGLRenderingContext!");
                }
            } catch (e) {
                /**
                 * @event fatal-error
                 */
                this.raiseEvent('fatal-error', {message: "Unable to initialize the WebGL renderer.",
                    details: e});
                $.console.error(e);
            }
            //$.console.log(`WebGL ${this.webglContext.getVersion()} Rendering module (ID ${this.uniqueId || '<main>'})`); TODO put return to catch (e) when uncommenting
        }

        /**
         * Search through all $.WebGLModule properties and find one that extends WebGLImplementation and it's getVersion() function returns "version" input parameter.
         * @param {string} version webgl version, "1.0" or "2.0"
         * @returns {null|WebGLImplementation}
         */
        static determineContext(version) {
            console.log("zistujem kontext, asi takym sposobom ze zas vsetko hladam hah ale z CLASSSSYYYYYYYYYY");
            const namespace = OpenSeadragon.WebGLModule;
            for (let property in namespace) {
                const context = namespace[ property ],
                    proto = context.prototype;
                if (proto && proto instanceof namespace.WebGLImplementation &&
                    $.isFunction( proto.getVersion ) && proto.getVersion.call( context ) === version) {
                        return context;
                }
            }
            return null;
        }

        /**
         * Execute call on each visualization layer with no errors
         * @param {object} spec current specification setup context
         * @param {function} callback call to execute
         * @param {function} onFail handle exception during execition
         * @return {boolean} true if no exception occured
         * @instance
         * @memberOf WebGLModule
         */
        static eachValidShaderLayer(spec, callback,
                                           onFail = (layer, e) => {
                                               layer.error = e.message;
                                               $.console.error(e);
                                           }) {
            let shaders = spec.shaders;
            if (!shaders) {
                return true;
            }
            let noError = true;
            for (let key in shaders) {
                let shader = shaders[key];

                if (shader && !shader.error) {
                    try {
                        callback(shader);
                    } catch (e) {
                        if (!onFail) {
                            throw e;
                        }
                        onFail(shader, e);
                        noError = false;
                    }
                }
            }
            return noError;
        }

        /**
         * Execute call on each _visible_ visualisation layer with no errors.
         * // Execute call on each visualisation layer with rendering attribute set to true. ???
         * Visible is subset of valid.
         * @param {object} spec current specification setup context
         * @param {function} callback call to execute
         * @param {function} onFail handle exception during execution
         * @return {boolean} true if no exception occured
         * @instance
         * @memberOf WebGLModule
         */
        static eachVisibleShaderLayer(spec, callback,
                                                  onFail = (layer, e) => {
                                                        layer.error = e.message;
                                                        $.console.error(e);
                                                  }) {

            let shaders = spec.shaders;
            if (!shaders) {
                return true;
            }
            let noError = true;
            for (let key in shaders) {
                //rendering == true means no error
                let shader = shaders[key];
                // console.log(`eachVisibleShaderLayer:: key=${key}, shader.rendering=${shader.rendering}`);
                if (shader && shader.rendering) {
                    try {
                        callback(shader);
                    } catch (e) {
                        if (!onFail) {
                            throw e;
                        }
                        onFail(shader, e);
                        noError = false;
                    }
                }
            }
            return noError;
        }

        /**
         * Function to JSON.stringify replacer
         * @param key key to the value
         * @param value value to be exported
         * @return {*} value if key passes exportable condition, undefined otherwise
         */
        static jsonReplacer(key, value) {
            return key.startsWith("_") || ["eventSource"].includes(key) ? undefined : value;
        }


        /**
         * Reset the engine to the initial state
         * @instance
         * @memberOf OpenSeadragon.WebGLModule
         */
        reset() {
            if (this._programs) {
                Object.values(this._programs).forEach(p => this._unloadProgram(p));
            }
            this.running = false;
            this._initialized = false;

            this._program = -1;
            this._programs = {};
            this._programSpecifications = [];
            this._dataSources = [];
            this._origDataSources = [];
        }


        /**
         * Sets viewport dimensions.
         * @instance
         * @memberOf WebGLModule
         */
        setDimensions(x, y, width, height) {
            // NETUSIM Z KADE SA TU ZJAVIL V RENDERERI CANVAS -> treba zistit ach jo
            this.canvas.width = width;
            this.canvas.height = height;
            this.gl.viewport(x, y, width, height);
        }

        /**
         * WebGL target canvas
         * @return {HTMLCanvasElement}
         */
        get canvas() {
            return this.gl.canvas;
        }

        /**
         * WebGL active program
         * @return {WebGLProgram}
         */
        get program() {
            return this._programs[this._program];
        }

        /**
         * Check if init() was called.
         * @return {boolean}
         * @instance
         * @memberOf OpenSeadragon.WebGLModule
         */
        get isInitialized() {
            return this._initialized;
        }

        /**
         * Get a list of image pyramids used to compose the current active specification
         * @instance
         * @memberOf WebGLModule
         */
        getSources() {
            return this._dataSources;
        }

         /**
         * Vyznamu tejto funkcii nechapem
         * from webgl20 gets webglProgram._osdOptions[name]
         */
         getCompiled(name, programIndex = this._program) {
            return this.webglContext.getCompiled(this._programs[programIndex], name);
        }


        /* Specification functions ------------------------------------------------------------------------------------------------------------------ */
        getSpecificationsCount() {
            return this._programSpecifications.length;
        }

        getSpecification(index) {
            return this._programSpecifications[index];
        }

        getSpecifications() {
            return this._programSpecifications;
        }

        /**
         * Set program shaders. Vertex shader is set by default a square.
         * @param {[RenderingConfig]} specifications - objects that define the what to render (see Readme)
         * @return {boolean} true if loaded successfully
         * @instance
         * @memberOf OpenSeadragon.WebGLModule
         */
        addRenderingSpecifications(...specifications) {
            for (let spec of specifications) {
                // checks correctness of specification
                const parsed = this._parseSpec(spec);
                if (parsed) {
                    this._programSpecifications.push(parsed);
                } else {
                    throw new Error("renderer::addRenderingSpecifications: Invalid specification!");
                }
            }
            return true;
        }

        /**
         * Checks if there is at least one shader specified in specification object.
         * For every shader specified defines params parameter if not already defined.
         */
        _parseSpec(specification) {
            if (!specification.shaders) {
                $.console.warn("Invalid visualization: no shaders defined", specification);
                return undefined;
            }

            let count = 0;
            for (let shaderName in specification.shaders) {
                const shader = specification.shaders[shaderName];
                if (!shader.params) {
                    shader.params = {};
                }
                count++;
            }

            if (count < 0) {
                $.console.warn("Invalid rendering specifications: no shader configuration present!", specification);
                return undefined;
            }
            return specification;
        }

        setRenderingSpecification(i, spec) {
            const parsed = this._parseSpec(spec);
            if (parsed) {
                this._programSpecifications[i] = parsed;
                return true;
            }

            // not correct specification
            return false;
        }

        deleteRenderingSpecification(i) {
            delete this._programSpecifications[i]; // sets _programSpecifications[i] to undefined
        }


        /* Program functions ------------------------------------------------------------------------------------------------------------------ */
        /**
         * Get current program index
         * @return {number} program index
         */
        getCurrentProgramIndex() {
            // if (this._program < 0 || this._program >= this._programSpecifications.length) {
            //     this._program = 0;
            // } OLD TOTO SOM VYKOMENTOVAL NEVIEM PRECO TO TU JE
            return this._program;
        }

        deleteProgram(i) {
            this._unloadProgram(this._programs[i]);
            delete this._programs[i]; // deletes i:value pair from _programs
        }

        /**
         * Detach fragment + vertex shader from <program>
         * @param {WebGLProgram} program
         */
        _unloadProgram(program) {
            if (program) {
                //must remove before attaching new
                this._detachShader(program, "VERTEX_SHADER");
                this._detachShader(program, "FRAGMENT_SHADER");
            }
        }

        /** Called only from _unloadProgram
         * Deletes <shaderType> shader from <program>
         * @param {WebGLProgram} program
         * @param {string} shaderType
         */
        _detachShader(program, shaderType) {
            let shader = program[shaderType];
            if (shader) {
                this.gl.detachShader(program, shader);
                this.gl.deleteShader(shader);
                program[shaderType] = null;
            }
        }

        useFirstPassProgram() {
            this.webglContext.loadFirstPassProgram();
        }

        drawFirstPassProgram(texture, textureCoords, transformMatrix) {
            this.webglContext.drawFirstPassProgram(texture, textureCoords, transformMatrix);
        }

        /**
         * Switch to program at index: this is the index (order) in which
         * setShaders(...) was called. If you want to switch to shader that
         * has been set with second setShaders(...) call, pass i=1.
         * @param {Number} i program index or null if you wish to re-initialize the current one
         * @instance
         * @memberOf OpenSeadragon.WebGLModule
         */
        useProgram(i) {
            if (!this._initialized) {
                $.console.warn("$.WebGLModule::useProgram(): renderer not initialized.");
                return;
            }
            //Mazem lebo pouzivam vlastny program mimo rendereru ktory nezmeni this._program
            // if (this._program === i) {
            //     return;
            // }
            this._forceSwitchProgram(i);
        }

        /**
         * Use custom delivered WebGLProgram not originating from this._programs
         * @param {WebGLProgram} program to use
         */
        useCustomProgram(program) {
            if (!this._initialized) {
                $.console.warn("$.WebGLModule::useCustomProgram(): renderer not initialized.");
                return;
            }
            this._program = -1;
            this.webglContext.programLoaded(program, null);
        }

        /**
         *
         * @param {number} i index of desired specification
         * @param {???} order ???
         * @param {boolean} force ???
         * @param {object} options
         * @param {boolean} options.withHtml whether html should be also created (false if no UI controls are desired)
         * @param {string} options.textureType type of texture to be used, supported are TEXTURE_2D, TEXTURE_2D_ARRAY, TEXTURE_3D
         * @param {string} options.instanceCount number of instances to draw at once
         * @param {boolean} options.debug draw debugging info
         * @return {boolean} true on success
         */
        buildProgram(i, order, force, options) {
            let specification = this._programSpecifications[i];
            if (!specification) {
                $.console.error("$.WebGLModule::buildProgram: Invalid rendering specification index", i, "!");
                return false;
            }

            if (order) {
                specification.order = order;
            }

            /* program moze byt undefined */
            let program = this._programs && this._programs[i];
            // force or program exists but has missing vertex shader [do not know how this could happen tho]
            force = force || (program && !program['VERTEX_SHADER']);
            if (force) {
                // detach old vertex + fragment shader (mozes poslat undefined, nic nespravi zle)
                this._unloadProgram(program);
                // BIG THING ! Create shaderObjects and their instantions, create glsl code of shaders which communicated with shaderObjects's instantions
                this._specificationToProgram(specification, i, options);

                if (i === this._program) {
                    this._forceSwitchProgram(this._program);
                }
                return true;
            }
            return false;
        }

        /**
         * Rebuild specification and update scene
         * @param {string[]|undefined} order of shaders, ID's of data as defined in setup JSON, last element
         *   is rendered last (top)
         * @instance
         * @memberOf OpenSeadragon.WebGLModule
         */
        rebuildCurrentProgram(order = undefined) {
            const program = this._programs[this._program];
            if (this.buildProgram(this._program, order, true, program && program._osdOptions)) {
                this._forceSwitchProgram(this._program);
            }
        }


        /**
         * Set data srouces
         */
        setSources(sources) {
            if (!this._initialized) {
                $.console.warn("$.WebGLModule::setSources(): renderer not initialized.");
                return;
            }
            this._origDataSources = sources || [];
        } // unused


        /** DRAWING !
         * Renders data using WebGL
         * @param {Object} spec object specification of shader to use
         * @param {GLuint|[GLuint]} textureArray texture array for instanced drawing
         * @param {Number} textureLayer
         * @param {Number} shaderLayerIndex uniform for fragment shader to decide which shaderLayer to use for rendering
         * @param {Object} tileOpts
         * @param {OpenSeadragon.Mat3|[OpenSeadragon.Mat3]} tileOpts.transform position transform
         *      matrix or flat matrix array (instance drawing)
         * @param {number} tileOpts.zoom value passed to the shaders as zoom_level
         * @param {number} tileOpts.pixelSize value passed to the shaders as pixel_size_in_fragments
         * @param {[8 Numbers]} tileOpts.textureCoords 8 numbers representing triangle strip
         * @param {number?} tileOpts.instanceCount OPTIONAL how many instances to draw in case instanced drawing is enabled
         *
         * @instance
         * @memberOf WebGLModule
         */
        processData(tileOpts, shaderLayer, texture = null, textureArray = null, textureLayer = null) {
            //console.log('processData: idem kreslit s maticou:', tileOpts.transform);
            // const spec = this._programSpecifications[this._program];
            //console.log('processData: spec=', spec);
            // console.log('processData, tileOpts =', tileOpts);
            // if (!spec) {
            //     $.console.error("Cannot render using invalid specification: did you call useCustomProgram?", this._program);
            // } else {
                this.webglContext.programUsed(this._programs[0], tileOpts, shaderLayer, texture, textureArray, textureLayer);
            // }
        }

        // CUSTOM program I guess DRAWING !
        processCustomData(texture, tileOpts) {
            this.webglContext.programUsed(this.program, null, texture, tileOpts);
        }

        /**
         * Whether the webgl module renders UI
         * @return {boolean}
         * @instance
         * @memberOf WebGLModule
         */
        supportsHtmlControls() {
            return typeof this.htmlControlsId === "string" && this.htmlControlsId.length > 0;
        }

        /////////////////////////////////////////////////////////////////////////////////////
        //// YOU PROBABLY WANT TO READ FUNCTIONS BELOW SO YOU KNOW HOW TO SET UP YOUR SHADERS
        //// BUT YOU SHOULD NOT CALL THEM DIRECTLY
        /////////////////////////////////////////////////////////////////////////////////////

        /** Called during Drawer's constructor and from this._loadScript
         * Initialization. It is separated from preparation (create Single pass shader) as this actually initiates the rendering,
         * sometimes this can happen only when other things are ready.
         * @param {number} width width of the first tile going to be drawn
         * @param {number} height height of the first tile going to be drawn
         * @param {number} firstProgram
         */
        init(width = 1, height = 1, firstProgram = 0) {
            console.log('V inite, width:height =', width, height);
            if (this._initialized) {
                $.console.error("Already initialized!");
                return;
            }
            // if (this._programSpecifications.length < 1) {
            //     $.console.error("No specification specified!");
            //     /**
            //      * @event fatal-error
            //      */
            //     this.raiseEvent('fatal-error', {message: "No specification specified!",
            //         details: "$.WebGLModule::init: Called with no specification set."});
            //     return;
            // }
            // this._program = firstProgram;
            // this.getCurrentProgramIndex();

            this._initialized = true;
            this.setDimensions(0, 0, width, height); // pridal som dve nuly na zaciatok

            // throw new Error("konec");
            // //todo rotate anticlockwise to cull backfaces
            // this.gl.enable(this.gl.CULL_FACE);
            // this.gl.cullFace(this.gl.FRONT);

            // //this.running = true; //podla mna to tu nema byt, _forceSwitchProgram nastavi spravne
            // console.log('V inite, idem do forceSwitchProgram');
            // this._forceSwitchProgram(this._program);
            // this.ready();
        }

        //////////////////////////////////////////////////////////////////////////////
        ///////////// YOU PROBABLY DON'T WANT TO READ/CHANGE FUNCTIONS BELOW
        //////////////////////////////////////////////////////////////////////////////

        /** Called only from webGLContext
         * Forward glLoaded event from webglContext to the all active shaders of current specification
         * @param gl
         * @param program
         * @param spec
         */
        glLoaded(gl, program, spec) {
            $.WebGLModule.eachVisibleShaderLayer(spec, layer => layer._renderContext.glLoaded(program, gl));
        }

        /** Called only from webGLContext
         * Forward glDrawing event from webglContext to the all active shaders of current specification
         * @param gl
         * @param program
         * @param spec
         * @param bounds
         */
        glDrawing(gl, program, spec, bounds) {
            $.WebGLModule.eachVisibleShaderLayer(spec, layer => layer._renderContext.glDrawing(program, gl));
        }


        /* _forceSwitchProgram functions ------------------------------------------------------------------------------------------------------------------ */
        /**
         * Force switch shader (program), will reset even if the specified
         * program is currently active, good if you need 'gl-loaded' to be
         * invoked (e.g. some uniform variables changed)
         * @param {Number} i program index or null if you wish to re-initialize the current one
         * @param _reset
         * @private
         */
        _forceSwitchProgram(i, _reset = true) {
            const specification = this._programSpecifications[i];
            if (!specification) {
                $.console.error(`$.WebGLModule::_forceSwitchProgram: Invalid rendering specification index ${i}!`);
                $.console.error('$.WebGLModule::_forceSwitchProgram: programSpecifications:', this._programSpecifications);
                // throw new Error("stop");
            }

            let program = this._programs[i];
            if (!program) {
                console.log(`forceSwitch, no program, gonna build one! this._programs =${this._programs}, i =${i}`);
                this._specificationToProgram(specification, i);
                program = this._programs[i];
                console.log('Pridany program, specs=', this.getSpecifications());
            } else if (i !== this._program) {
                this._updateRequiredDataSources(specification);
            }

            this._program = i;
            if (specification.error) {
                this.running = false;
                if (this.supportsHtmlControls()) {
                    this._loadHtml(program); //zrusil som prvy parameter i, bol to bug podla mna
                }

                this._loadScript(i); //checks whether all shaderObjects are initialized correctly
                if (this._programSpecifications.length <= 1) {
                    /**
                     * @event fatal-error
                     */
                    this.raiseEvent('fatal-error', {message: "The only rendering specification left is invalid!", specification: specification});
                } else {
                    /**
                     * @event error
                     */
                    this.raiseEvent('error', {message: "Currently chosen rendering specification is invalid!", specification: specification});
                }
            } else {
                this.running = true;
                if (this.supportsHtmlControls()) {
                    this._loadHtml(program);
                }

                // this._loadDebugInfo(); este nerozumiem tomuto tak som vykomentoval
                if (!this._loadScript(i)) { //if not all shaders are valid
                    if (!_reset) {
                        throw "Could not build visualization";
                    }
                    this._forceSwitchProgram(i, false); //force reset in errors
                    return;
                }

                // NAJDOLEZITEJSI riadok v tejto funkcii, vola pripravu WebGL programu
                this.webglContext.programLoaded(program, specification);
            }
        }

        /**
         * Switch to first or second rendering pass.
         * @param {number} pass 1 = first pass, 2 = second pass
         */
        switchToRenderingPass(pass) {
            this.webglContext.switchToRenderingPass(pass);
        }

        // called only from _forceSwitchProgram
        _loadHtml(program) {
            let htmlControls = document.getElementById(this.htmlControlsId);
            htmlControls.innerHTML = this.webglContext.getCompiled(program, "html") || "";
        }

        /** Called only from _forceSwitchProgram
         * Check whether all shaderObjects of specification with specId are correctly initialized.
         * @param {number} specId id of specification
         * @returns
         */
        _loadScript(specId) {
            return $.WebGLModule.eachValidShaderLayer(this._programSpecifications[specId], layer => layer._renderContext.init());
        }

        // called only from _loadDebugInfo
        _getDebugInfoPanel() {
            return `<div id="test-inner-${this.uniqueId}-webgl">
    <b>WebGL Processing I/O (debug mode)</b>
    <div id="test-${this.uniqueId}-webgl-log"></div>
    Input: <br><div style="border: 1px solid;display: inline-block; overflow: auto;" id='test-${this.uniqueId}-webgl-input'>No input.</div><br>
    Output:<br><div style="border: 1px solid;display: inline-block; overflow: auto;" id="test-${this.uniqueId}-webgl-output">No output.</div>`;
        }

        // called only from _forceSwitchProgram
        _loadDebugInfo() {
            console.log('renderer::_loadDebugInfo');
            if (!this.debug) {
                console.log('renderer::_loadDebugInfo: neni zapaty debug, uz aj sa vraciam hihi');
                return;
            }
            console.log('enderer::_loadDebugInfo: je zapaty debug asi mhgmmmm');
            if (!this.supportsHtmlControls()) {
                console.warn(`WebGL Renderer ${this.uniqueId} does not support visual rendering without enabled HTML control!`);
                return;
            }

            let container = document.getElementById(`test-${this.uniqueId}-webgl`);
            if (!container) {
                if (!this.htmlControlsId) {
                    document.body.innerHTML += `<div id="test-${this.uniqueId}-webgl" style="position:absolute; top:0; right:0; width: 250px">${this._getDebugInfoPanel()}</div>`;
                } else {
                    //safe as we do this before handlers are attached
                    document.getElementById(this.htmlControlsId).parentElement.innerHTML += `<div id="test-${this.uniqueId}-webgl" style="width: 100%;">${this._getDebugInfoPanel()}</div>`;
                }
            }
        }


        /* Important functions ------------------------------------------------------------------------------------------------------------------ */
        // called only from _buildSpecification
        _buildFailed(specification, error) {
            $.console.error(error);
            specification.error = "Failed to compose this specification.";
            specification.desc = error;
        }

        /**
         * Little correctness check, important is:
         * compileSpec call to webGLContext, webglcontext iterates through shaders and communicates with their instantions (shaderObject._renderContext) I guess.
         * @param {WebGLProgram} program webgl program corresponding to a specification
         * @param {object} specification concrete specification from this._programSpecifications
         * @param {object} options
         * @param {boolean} options.withHtml whether html should be also created (false if no UI controls are desired)
         * @param {string} options.textureType id of texture to be used, supported are TEXTURE_2D, TEXTURE_2D_ARRAY, TEXTURE_3D
         * @param {string} options.instanceCount number of instances to draw at once
         * @param {boolean} options.debug draw debugging info
         */
        _buildSpecification(program, specification, options) {
            try {
                // this.htmlControlsId is an not an empty string
                options.withHtml = this.supportsHtmlControls();
                const usableShaderCount = this.webglContext.compileSpecification(program, specification, options);

                //preventive
                delete specification.error;
                delete specification.desc;

                if (usableShaderCount < 1) {
                    this._buildFailed(specification, `Empty specification: no valid specification has been specified.
    <br><b>Specification setup:</b></br> <code>${JSON.stringify(specification, $.WebGLModule.jsonReplacer)}</code>
    <br><b>Dynamic shader data:</b></br><code>${JSON.stringify(specification.data)}</code>`);
                    return;
                }
            } catch (error) {
                this._buildFailed(specification, error);
            }
        }

        // returns shaderLayer instantiations
        _getRenderContextsFromSpecifications() {
            let contexts = [];
            for (const spec of this._programSpecifications) {
                if (spec !== undefined) {
                    contexts.push(spec.shaders.renderShader._renderContext);
                }
            }

            return contexts;
        }

        _getShaders() {
            let shaders = [];
            for (const shaderType in this.shadersCounter) {
                shaders.push(this.shadersCounter[shaderType].shaderLayer);
            }
            return shaders;
        }

        createProgram() {
            const program = this.webglContext.programCreated(this._getShaders());
            this._program = 0;
            this._programs[0] = program;

            this.running = true;
        }

        updateProgram(specification, shaderType) {
            console.log('renderer:: updateProgram call!');

            const Shader = $.WebGLModule.ShaderMediator.getClass(shaderType);
            // const Shader = $.WebGLModule.ShaderMediator.getClass("edge");
            const shader = new Shader(shaderType + '_shader', {
                shaderObject: specification.shaders.renderShader,
                webglContext: this.webglContext,
                interactive: false,
                invalidate: () => {},
                rebuild: () => {},
                refetch: () => {}
            });
            shader.construct();
            if (!shader.initialized()) {
                throw new Error('renderer.js::updateProgram(): Could not construct shader from specification =', specification, '!');
            }
            shader.init();

            const program = this.webglContext.programCreated(this._getShaders().concat([shader]));
            this._program = 0;
            this._programs[0] = program;

            // this.running = true;
            // this.gl.useProgram(program);
            // this.webglContext.programLoaded(program, specification);

            console.log('renderer.js::updateProgram(): PROGRAM UPDATED!');
            return shader;
        }

        useDefaultProgram(numOfRenderPasses) {
            const program = this._programs[0];
            this.gl.useProgram(program);
            // for (const spec of this._programSpecifications) {
            //     this.webglContext.programLoaded(program, spec);
            // }
            this.webglContext.programLoaded(program, null, this._getShaders());
            this.webglContext.setRenderingType(numOfRenderPasses);
        }

        /**
         * Popis:
         * @param {object} spec json coming with tiledImage defining it's settings
         * @param {string} shaderType examples = identity, edge, negative,...
         * @returns {ShaderLayer} instantion of shader to use with tiledImage
         */
        getShader(spec, shaderType) {
            if (this.shadersCounter[shaderType] === undefined) {
                const newShader = this.updateProgram(spec, shaderType);
                this.shadersCounter[shaderType] = {};
                this.shadersCounter[shaderType]["count"] = 1;
                this.shadersCounter[shaderType]["shaderLayer"] = newShader;
            } else {
                this.shadersCounter[shaderType]["count"]++;
            }

            return this.shadersCounter[shaderType]["shaderLayer"];
        }

        removeShader(shaderType) {
            // delete shader from the map and recreate the WebGLProgram without <shaderType> shader
            if (this.shadersCounter[shaderType]["count"] === 1) {
                delete this.shadersCounter[shaderType];
                this.createProgram();

            // not removing shader from the WebGLProgram because another tiledImage still uses it
            } else {
                this.shadersCounter[shaderType]["count"]--;
            }

            console.log('removeShader, this.shadersCounter po odobrati =', this.shadersCounter);
        }

        printWebglShadersOfCurrentProgram() {
            const opts = this._programs[0]._osdOptions;
            $.console.info("VERTEX SHADER\n", opts.vs);
            $.console.info("FRAGMENT SHADER\n", opts.fs);
        }

        setRenderingType(n) {
            this.webglContext.setRenderingType(n);
        }

        /**
         * Iterate through specification's shaderObjects and create their corresponding instantions.
         * BuildSpec call begins creation of glsl code, webglcontext iterates through shaders and communicates with their instantions I guess.
         * @param {Object} spec specification to be used
         * @param {number} idx index of specification in this._programSpecifications
         * @param {object} options
         * @param {boolean} options.withHtml whether html should be also created (false if no UI controls are desired)
         * @param {string} options.textureType type of texture to be used, supported are TEXTURE_2D, TEXTURE_2D_ARRAY, TEXTURE_3D
         * @param {string} options.instanceCount number of instances to draw at once
         * @param {boolean} options.debug draw debugging info
         * @returns
         */
        _specificationToProgram(spec, idx, options = {}) {
            // nastavi _dataSources na [__gdnu__ * pocet datareferenci v spec.shaders.ALL.datareferences]
            this._updateRequiredDataSources(spec);
            const gl = this.gl;
            let program;

            let index = -1;
            // if program is not already built
            if (!this._programs[idx]) {
                program = gl.createProgram();
                this._programs[idx] = program;
                for (let key in spec.shaders) {
                    index++;
                    let shaderObject = spec.shaders[key];
                    // invalid shader or type === "none", which means skip this layer
                    if (!shaderObject || shaderObject.type === "none") {
                        console.error(`Invalid shader object on index ${index} in specification:`, spec);
                        continue;
                    }
                    // create shader
                    let ShaderFactoryClass = $.WebGLModule.ShaderMediator.getClass(shaderObject.type); // get <shaderObject.type>(eg.: identity) shader class (extends OpenSeadragon.WebGLModule.ShaderLayer)
                    if (!ShaderFactoryClass) {
                        shaderObject.error = "Unknown shaderObject type.";
                        shaderObject.desc = `The shaderObject type '${shaderObject.type}' has no associated factory.`;
                        console.warn("Skipping shaderObject " + key);
                        continue;
                    }
                    this._initializeShaderFactory(spec, ShaderFactoryClass, shaderObject, index);
                    }

            } else { // program was already built
                program = this._programs[idx];
                for (let key in spec.shaders) {
                    index++;
                    let shaderObject = spec.shaders[key];

                    // invalid shader or type === "none", which means skip this layer
                    if (!shaderObject || shaderObject.type === "none") {
                        console.error(`Invalid shader object on index ${index} in specification:`, spec);
                        continue;
                    }

                    // shader is already built correctly
                    if (!shaderObject.error &&
                        shaderObject._renderContext &&
                        shaderObject._renderContext.constructor.type() === shaderObject.type &&
                        shaderObject._index === index) {
                        continue;
                    }

                    // recreate shader
                    delete shaderObject.error;
                    delete shaderObject.desc;
                    let ShaderFactoryClass = $.WebGLModule.ShaderMediator.getClass(shaderObject.type);
                    if (!ShaderFactoryClass) {
                        shaderObject.error = "Unknown shaderObject type.";
                        shaderObject.desc = `The shaderObject type '${shaderObject.type}' has no associated factory.`;
                        /* shaderObject.name je undefined, asi si chcel ze ako ja shaderObject nazvany v spec.shaders, ale neviem ako to ziskat */
                        console.warn("Skipping shaderObject " + shaderObject.name);
                        continue;
                    }
                    this._initializeShaderFactory(spec, ShaderFactoryClass, shaderObject, index);
                }
            }

            // set spec.order: [string] to array containing shaderObject keys from spec.shaders
            if (!Array.isArray(spec.order) || spec.order.length < 1) {
                spec.order = Object.keys(spec.shaders);
            }

            console.log('Tu som!');
            this._buildSpecification(program, spec, options);
            this.visualisationReady(idx, spec); // useless now, probably name should be something like specificationReady
            return idx;
        }

        /**
         * Final initialization of shaderObject.
         * Set properties, put concrete (plainShader) implementation into _renderContext property
         * @param {Object} spec specification containing this shader
         * @param {function} ShaderFactoryClass shader class, extends OpenSeadragon.WebGLModule.ShaderLayer (asi zatial plainShader)
         * @param {Object} shaderObject concrete shader object definition from spec.shaders
         * @param {number} idx index of shaderObject in spec.shaders
         */
        _initializeShaderFactory(spec, ShaderFactoryClass, shaderObject, idx) {
            const _this = this;
            shaderObject._index = idx;
            shaderObject.visible = shaderObject.visible === undefined ? true : shaderObject.visible;
            /* unikatne indexovanie je dobre spravene ?? povedzem this.uniqueId = 1, idx = 11 da to iste ako this.uniqueId = 11, idx = 1
                navrhujem tam dat podtrznik alebo tak 1_11 / 11_1*/
            // vytvara shader(id, options)
            shaderObject._renderContext = new ShaderFactoryClass(`${this.uniqueId}${idx}`, {
                // ma odkaz sam na seba vyssie
                shaderObject: shaderObject,
                webglContext: this.webglContext,
                interactive: this.supportsHtmlControls(),
                // dava sa UI controls nech to volaju ked sa zmeni ich hodnota (triggeruje prekreslenie viewportu)
                invalidate: this.resetCallback,
                // triggeruje prekompilovanie a prekreslenie viewportu
                rebuild: this.rebuildCurrentProgram.bind(this, undefined),
                refetch: function() {
                    _this._updateRequiredDataSources(spec);
                    //TODO: how to tell openseadragon to invalidate the whole data source?
                    // !!implement!!
                    // used to call: _this.visualisationChanged(visualization, visualization);
                    //  --> no longer part of api
                    throw "Not yet implemented!";
                }
            });
            /* momentalne shaderObject.params = {}, shaderObject.dataReferences = [0] */
            shaderObject._renderContext.construct(shaderObject.params || {}, shaderObject.dataReferences);
            if (!shaderObject._renderContext.initialized()) {
                console.error(`Invalid shader -> ${ShaderFactoryClass.name()}! Construct must call super implementation!`);
            }
            console.log('Shader implementacia hotofson, zacina dalsia era !', shaderObject._renderContext);
            console.log('specs =', this.getSpecifications());
        }


        /**
         * Works on _origDataSources and _dataSources variables.
         * Sets _dataSources to ??? tu som sa stratil neviem co to ma robit
         * Okej myslim si ze nastavi _dataSources na [__gdnu__ * pocet referenci v spec.shaders.ALL.datareferences]
         * @param {Object} spec specification
         */
        // Poznamka setSources nieje nikde volana, tj. _origDataSources budu vzdy na zaciatku []
        _updateRequiredDataSources(spec) {
            //for now just request all data, later decide in the context on what to really send
            //might in the future decide to only request used data, now not supported
            let usedIds = new Set();
            for (let key in spec.shaders) {
                let layer = spec.shaders[key];
                if (layer) {
                    for (let x of layer.dataReferences) {
                        usedIds.add(x);
                    }
                }
            }
            usedIds = [...usedIds].sort();
            this._dataSources = [];

            // usedIds = vsetky dataReferences z specification objektu ktore su definovane
            // _origDataSources su [], cize sa napushuje do nich <najvacsie id + 1> * "__generated_do_not_use__"
            while (usedIds[usedIds.length - 1] >= this._origDataSources.length) {
                //make sure values are set if user did not provide
                this._origDataSources.push("__generated_do_not_use__");
            }

            // tak toto nastavi _dataSources na [__gdnu__ * usedIds.length]
            for (let id of usedIds) {
                this._dataSources.push(this._origDataSources[id]);
            }
        }


        /* Called only from drawer's functions ------------------------------------------------------------------------------------------------------------------ */
        /* Called only from drawer's constructor */
        //single pass shaders are built-in shaders compiled from JSON
        _createSinglePassShader(textureType) {
            this.defaultRenderingSpecification = {
                shaders: {
                    renderShader: {
                        type: "identity",
                        // type: "edge",
                        dataReferences: [0],
                    }
                }
            };
            this.buildOptions = {
                withHtml: false,
                textureType: textureType,
                //batch rendering (artifacts)
                //instanceCount: this.maxTextureUnits,
                instanceCount: 1,
                debug: false
            };

            // number of specifications in $.WebGLModule._programSpecifications: []
            const index = this.getSpecificationsCount();
            // $.WebGLModule._programSpecifications[0] = this.defaultRenderingSpecification
            this.addRenderingSpecifications(this.defaultRenderingSpecification);
            // index of defaultRenderingSpecification in _programSpecifications, order??, force??,
            // options.withHtml, options.textureType, options.instanceCount, options.debug
            this.buildProgram(index, "TEXTURE_2D", true, this.buildOptions); // pridal som "TEXTURE_2D" namiesto null pri debuggovani flipped
        }

        setDataBlendingEnabled(enabled) {
            if (enabled) {
                // this.gl.enable(this.gl.BLEND);
                // this.gl.blendEquation(this.gl.FUNC_ADD);
                // this.gl.blendFuncSeparate(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA, this.gl.ONE, this.gl.ONE);
                this.gl.enable(this.gl.BLEND);
                this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
            } else {
                this.gl.disable(this.gl.BLEND);
            }
        }



    };
    /**
     * ID pattern allowed for module, ID's are used in GLSL
     * to distinguish uniquely between static generated code parts
     * @type {RegExp}
     */
    $.WebGLModule.idPattern = /^(?!_)(?:(?!__)[0-9a-zA-Z_])*$/;

})(OpenSeadragon);

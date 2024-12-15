(function($) {
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

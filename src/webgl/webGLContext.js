// 700 riadkov

(function($) {
    /**
     * Creates an array of size "n" that looks exactly like this -> [0, 1, 2, ... , n-1]
     * @param {number} n
     * @returns {[number]}
     */
    function iterate(n) {
        let result = Array(n),
            it = 0;
        while (it < n) {
            result[it] = it++;
        }
        return result;
    }

    /**
     * @interface OpenSeadragon.WebGLModule.WebGLImplementation
     * Interface for the visualisation rendering implementation which can run
     * on various GLSL versions
     */
    $.WebGLModule.WebGLImplementation = class {

        /**
         * Create a WebGL Renderer Context Implementation (version-dependent)
         * @param {WebGLModule} renderer
         * @param {WebGLRenderingContext|WebGL2RenderingContext} gl
         * @param {string} webglVersion "1.0" or "2.0"
         * @param {object} options
         * @param {GLuint} options.wrap  texture wrap parameteri
         * @param {GLuint} options.magFilter  texture filter parameteri
         * @param {GLuint} options.minFilter  texture filter parameteri
         */
        constructor(renderer, gl, webglVersion, options) {
            //Set default blending to be MASK
            this.renderer = renderer;
            this.gl = gl;
            this.webglVersion = webglVersion;
            this.options = options;
        }

        /**
         * Static context creation (to avoid class instantiation in case of missing support)
         * @param canvas
         * @param options desired options used in the canvas webgl context creation
         * @return {WebGLRenderingContext|WebGL2RenderingContext}
         */
        static create(canvas, options) {
            throw("$.WebGLModule.WebGLImplementation::create() must be implemented!");
        }

        /**
         * @return {string} WebGL version used
         */
        getVersion() {
            throw("$.WebGLModule.WebGLImplementation::getVersion() must be implemented!");
        }

        /**
         * Get GLSL texture sampling code
         * @return {string} GLSL code that is correct in texture sampling wrt. WebGL version used
         */
        get texture() {
            return this._texture;
        }

        getCompiled(program, name) {
            throw("$.WebGLModule.WebGLImplementation::getCompiled() must be implemented!");
        }

        /**
         * Create a visualisation from the given JSON params
         * @param program
         * @param {string[]} order keys of visualisation.shader in which order to build the visualization
         *   the order: painter's algorithm: the last drawn is the most visible
         * @param {object} visualisation
         * @param {object} options
         * @param {boolean} options.withHtml whether html should be also created (false if no UI controls are desired)
         * @param {string} options.textureType id of texture to be used, supported are TEXTURE_2D, TEXTURE_2D_ARRAY, TEXTURE_3D
         * @param {string} options.instanceCount number of instances to draw at once
         * @return {number} amount of usable shaders
         */
        compileSpecification(program, order, visualisation, options) {
            throw("$.WebGLModule.WebGLImplementation::compileSpecification() must be implemented!");
        }

        /**
         * Called once program is switched to: initialize all necessary items
         * @param {WebGLProgram} program  used program
         * @param {OpenSeadragon.WebGLModule.RenderingConfig?} currentConfig  JSON parameters used for this visualisation
         */
        programLoaded(program, currentConfig = null) {
            throw("$.WebGLModule.WebGLImplementation::programLoaded() must be implemented!");
        }

        /**
         * Draw on the canvas using given program
         * @param {WebGLProgram} program  used program
         * @param {OpenSeadragon.WebGLModule.RenderingConfig?} currentConfig  JSON parameters used for this visualisation
         * @param {GLuint} texture
         * @param {object} tileOpts
         * @param {number} tileOpts.zoom value passed to the shaders as zoom_level
         * @param {number} tileOpts.pixelSize value passed to the shaders as pixel_size_in_fragments
         * @param {OpenSeadragon.Mat3|[OpenSeadragon.Mat3]} tileOpts.transform position transform
         * @param {number?} tileOpts.instanceCount how many instances to draw in case instanced drawing is enabled
         *   matrix or flat matrix array (instance drawing)
         */
        programUsed(program, currentConfig, texture, tileOpts = {}) {
            throw("$.WebGLModule.WebGLImplementation::programUsed() must be implemented!");
        }

        sampleTexture(index, vec2coords) {
            throw("$.WebGLModule.WebGLImplementation::sampleTexture() must be implemented!");
        }

        /**
         *
         * @param {WebGLProgram} program
         * @param definition
         * @param execution
         * @param {object} options
         * @param {string} options.textureType id of texture to be used, supported are TEXTURE_2D, TEXTURE_2D_ARRAY, TEXTURE_3D
         * @param {string} options.instanceCount number of instances to draw at once
         */
        compileFragmentShader(program, definition, execution, options) {
            throw("$.WebGLModule.WebGLImplementation::compileFragmentShader() must be implemented!");
        }

        /**
         *
         * @param {WebGLProgram} program
         * @param definition
         * @param execution
         * @param {object} options
         * @param {string} options.textureType id of texture to be used, supported are TEXTURE_2D, TEXTURE_2D_ARRAY, TEXTURE_3D
         * @param {string} options.instanceCount number of instances to draw at once
         */
        compileVertexShader(program, definition, execution, options) {
            throw("$.WebGLModule.WebGLImplementation::compileVertexShader() must be implemented!");
        }

        /**
         * Code to be included only once, required by given shader type (keys are considered global).
         * @param {string} type shader type
         * @returns {object} global-scope code used by the shader in <key: code> format
         */
        /* Vracia pre konkretny zadany shader jeho __globalIncludes */
        globalCodeRequiredByShaderType(type) {
            return $.WebGLModule.ShaderMediator.getClass(type).__globalIncludes;
        }

        /**
         * Blend equation sent from the outside, must be respected
         * @param glslCode code for blending, using two variables: 'foreground', 'background'
         * @example
         * //The shader context must define the following:
         *
         * vec4 some_blending_name_etc(in vec4 background, in vec4 foreground) {
         *     // << glslCode >>
         * }
         *
         * void blend_clip(vec4 input) {
         *     //for details on clipping mask approach see show() below
         *     // <<use some_blending_name_etc() to blend input onto output color of the shader using a clipping mask>>
         * }
         *
         * void blend(vec4 input) { //must be called blend, API
         *     // <<use some_blending_name_etc() to blend input onto output color of the shader>>
         * }
         *
         * //Also, default alpha blending equation 'show' must be implemented:
         * void show(vec4 color) {
         *    //pseudocode
         *    //note that the blending output should not immediatelly work with 'color' but perform caching of the color,
         *    //render the color given in previous call and at the execution end of main call show(vec4(.0))
         *    //this way, the previous color is not yet blended for the next layer show/blend/blend_clip which can use it to create a clipping mask
         *
         *    compute t = color.a + background.a - color.a*background.a;
         *    output vec4((color.rgb * color.a + background.rgb * background.a - background.rgb * (background.a * color.a)) / t, t)
         * }
         */
        setBlendEquation(glslCode) {
            this.glslBlendCode = glslCode;
        }

        /** Taky ten boilerplate code na attachnutie shaderov a linknutie programu -> spojazdnenie WebGLProgram-u. + Vychytava chyby pri buildeni.
         * Attach shaders and link WebGLProgram, catch errors.
         * @param {WebGLProgram} program
         * @param {function(error: string, description: string)} onError callback to call when error happens, sets corresponding
         * specification.error = error;
         * specification.desc = description;
         */
        _compileProgram(program, onError) {
            const gl = this.gl;
            /* Napriklad gl.getProgramParameter(program, gl.LINK_STATUS) pre kind = "Program", status = "LINK", value = program */
            function ok(kind, status, value, sh) {
                if (!gl['get' + kind + 'Parameter'](value, gl[status + '_STATUS'])) {
                    $.console.error((sh || 'LINK') + ':\n' + gl['get' + kind + 'InfoLog'](value));
                    return false;
                }
                return true;
            }

            /* Attach shader to the WebGLProgram, return true if valid. */
            function useShader(gl, program, data, type) {
                let shader = gl.createShader(gl[type]);
                gl.shaderSource(shader, data);
                gl.compileShader(shader);
                gl.attachShader(program, shader);
                program[type] = shader;
                return ok('Shader', 'COMPILE', shader, type);
            }

            function numberLines(str) {
                // from https://stackoverflow.com/questions/49714971/how-to-add-line-numbers-to-beginning-of-each-line-in-string-in-javascript
                return str.split('\n').map((line, index) => `${index + 1} ${line}`).join('\n');
            }

            const opts = program._osdOptions;
            if (!opts) {
                $.console.error("Invalid program compilation! Did you build shaders using compile[Type]Shader() methods?");
                onError("Invalid program.", "Program not compatible with this renderer!");
                return;
            }

            // Attaching shaders to WebGLProgram failed
            if (!useShader(gl, program, opts.vs, 'VERTEX_SHADER') ||
                !useShader(gl, program, opts.fs, 'FRAGMENT_SHADER')) {
                onError("Unable to use this specification.",
                    "Attaching of shaders to WebGLProgram failed. For more information, see logs in the $.console.");
                $.console.warn("VERTEX SHADER\n", numberLines( opts.vs ));
                $.console.warn("FRAGMENT SHADER\n", numberLines( opts.fs ));
            } else { // Shaders attached
                gl.linkProgram(program);
                if (!ok('Program', 'LINK', program)) {
                    onError("Unable to use this specification.",
                        "Linking of WebGLProgram failed. For more information, see logs in the $.console.");
                } else { //if (this.renderer.debug) { //todo uncomment in production
                    $.console.info("VERTEX SHADER\n", numberLines( opts.vs ));
                    $.console.info("FRAGMENT SHADER\n", numberLines( opts.fs ));
                }
            }
        }
    };

    $.WebGLModule.WebGL20 = class extends $.WebGLModule.WebGLImplementation {
        /**
         *
         * @param {OpenSeadragon.WebGLModule} renderer
         * @param {WebGL2RenderingContext} gl
         * @param options
         */
        constructor(renderer, gl, options) {
            // console.log("konstruujem webgl20 implementaciu");
            super(renderer, gl, "2.0", options); // sets this.renderer, this.gl, this.webglVersion, this.options

            // this.vao = gl.createVertexArray();

            // attributes
            this._bufferTexturePosition = gl.createBuffer(); // :glBuffer

            this._locationPixelSize = null; // :glUniformLocation, odpoveda "pixel_size_in_fragments" v glsl //fragment shader uniform
            this._locationZoomLevel = null; // :glUniformLocation, odpoveda "zoom_level" v glsl //fragment shader uniform

            this._locationMatrices = null; // :glUniformLocation, odpoveda "osd_transform_matrix" v glsl //vertex shader uniform
            this._locationTexturePosition = null; // :glAttribLocation, odpoveda "osd_tile_texture_position" v glsl //vertex shader attribute

            // attributes for instanced rendering
            this._bufferMatrices = gl.createBuffer(); // :glBuffer
            this._locationMatrices = null; // :glAttribLocation, odpoveda "osd_transform_matrix" v glsl, vertex shader uniform
            this._textureLoc = null; // :glUniformLocation = odpoveda "_vis_data_sampler" v glsl, fragment shader uniform sampler2D/.../...


            // Create a texture.
            this.glyphTex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.glyphTex);
            // Fill the texture with a 1x1 blue pixel.
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                new Uint8Array([0, 0, 255, 255]));
            // Asynchronously load an image
            var image = new Image();
            image.src = "8x8-font.png";

            const _this = this;
            image.addEventListener('load', function() {
                // Now that the image has loaded make copy it to the texture.
                gl.bindTexture(gl.TEXTURE_2D, _this.glyphTex);
                /* Multiplies the alpha channel into the other color channels */
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
                // Put the picture into the texture
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            });
        }

        /** Get WebGL2RenderingContext (static used to avoid instantiation of this class in case of missing support)
         * @param canvas
         * @param options desired options used in the canvas webgl context creation
         * @return {WebGL2RenderingContext}
         */
        static create(canvas, options) {
            /* a boolean value that indicates if the canvas contains an alpha buffer */
            options.alpha = true;
            /* a boolean value that indicates that the page compositor will assume the drawing buffer contains colors with pre-multiplied alpha */
            options.premultipliedAlpha = true;
            return canvas.getContext('webgl2', options);
        }

        getVersion() {
            return "2.0";
        }

        // tomuto nerozumiem celkom naco tu je, je volana z rendereru myslim
        getCompiled(program, name) {
            return program._osdOptions[name];
        }

        /* ??? */
        sampleTexture(index, vec2coords) {
            return `osd_texture(${index}, ${vec2coords})`;
        }

        /** Dolezita flow funkcia, je volana pri buildeni specifikacie v rendereri.
         * Prechadza cez shaders danej spec, komunikuje s ich instanciami
         * a robi podla nich glsl kod pre fragment shader (vola ich funkcie getFragmentShaderDefinition/Execution).
         * Natvrdo spravi glsl kod pre definition a execution pre vertex shader.
         * Vola funkcie compileVertex/FragmentShader, ktorym predava odpovedajuce definition, execution a
         * dostava full glsl kod pre vertex shader a fragment shader.
         *
         * Nastavuje program.osdOptions na options + .vs/.fs na glsl kod shaderov.
         * Vola _compileProgram ktory pripravi cely WebGLProgram k pouzitiu.
         *
         * Nedoriesene:
         * Generating HTML: html = getNewHtmlString() + html (reverse order append to show first the last drawn element (top))
         *
         * @param {WebGLProgram} program program corresponding to a specification
         * @param {object} specification concrete specification from this.renderer._programSpecifications
         * @param {object} specification.shaders object containing shaderObjects (here layers)
         * @param {[string]} specification.order array containing keys from specification.shaders
         * @param {object} options
         * @param {boolean} options.withHtml whether html should be also created (false if no UI controls are desired)
         * @param {string} options.textureType id of texture to be used, supported are TEXTURE_2D, TEXTURE_2D_ARRAY, TEXTURE_3D
         * @param {string} options.instanceCount number of instances to draw at once
         * @param {boolean} options.debug draw debugging info
         * @returns {number} number of usable shaders
         */
        //todo try to implement on the global scope version-independntly
        compileSpecification(program, specification, options) {
            // fragment shader's code placed outside of the main function
            var definition = "\n",
            // fragment shader's code placed inside the main function
                execution = "",
                html = "",
                _this = this,
                usableShaders = 0,
                dataCount = 0,
                globalScopeCode = {};

            specification.order.forEach(shaderName => {
                // layer = shaderObject
                let layer = specification.shaders[shaderName];
                layer.rendering = false;

                if (layer.type === "none") { // skip the layer
                    //prevents the layer from being accounted for
                    layer.error = "Not an error - layer type none.";
                } else if (layer.error) { // layer with error
                    if (options.withHtml) {
                        html = _this.renderer.htmlShaderPartHeader(layer.error, shaderName, false, layer, false) + html;
                    }
                    $.console.warn(`specification.shaders.${shaderName} has en error:`, layer.error, "\nError description:", layer.desc);

                } else if (layer._renderContext && layer._index !== undefined) { // properly built layer
                    //todo consider html generating in the renderer
                    usableShaders++;

                    //make visible textures if 'visible' flag set
                    //todo either allways visible or ensure textures do not get loaded
                    if (layer.visible) {
                        layer.rendering = true;

                        let shader = layer._renderContext;

                        // returns array of strings where one element corresponds to one glsl code line
                        let fsd = shader.getFragmentShaderDefinition();
                        console.log('fsd ->', fsd);

                        /* map adds tabs to glsl code lines, join puts them all together separating them with newlines
                            (join used because we do not want to add newline to the last line of code) */
                        definition += fsd.map((glLine) => "    " + glLine).join("\n");

                        // getFSE `return ${this.sampleChannel("osd_texture_coords")};` (from plainShader)
                        // getFSE = osd_texture(0, osd_texture_coords).rgba
                        definition += `
    vec4 lid_${layer._index}_xo() {
        ${shader.getFragmentShaderExecution()}
    }`;
                        console.log('order.foreach, definition po pridani:\n', definition);

                        if (shader.opacity) { // multiply alpha channel by opacity and than call blend function
                            execution += `
        vec4 l${layer._index}_out = lid_${layer._index}_xo();
        l${layer._index}_out.a *= ${shader.opacity.sample()};
        blend(l${layer._index}_out, ${shader._blendUniform}, ${shader._clipUniform});`;
                        } else { // immediately call blend function
                            execution += `
        blend(lid_${layer._index}_xo(), ${shader._blendUniform}, ${shader._clipUniform});`;
                        }

                        // prida do globalScopeCode shader.__globalIncludes [globalScopeCode je v fragment shader's definition (code outside main)]
                        $.extend(globalScopeCode, _this.globalCodeRequiredByShaderType(layer.type));
                        dataCount += layer.dataReferences.length;
                    }

                    if (options.withHtml) {
                        html = _this.renderer.htmlShaderPartHeader(layer._renderContext.htmlControls(),
                            shaderName, layer.visible, layer, true) + html;
                    }

                } else { // layer not skipped, not with error, but still not correctly built
                    if (options.withHtml) {
                        html = _this.renderer.htmlShaderPartHeader(`The requested specification type does not work properly.`,
                            shaderName, false, layer, false) + html;
                    }
                    $.console.warn(`specification.shaders.${shaderName} was not correctly built, shaderObject:`, layer);
                }
            }); // end of order.forEach

            if (!options.textureType) {
                if (dataCount === 1) {
                    options.textureType = "TEXTURE_2D";
                }
                if (dataCount > 1) {
                    options.textureType = "TEXTURE_2D_ARRAY";
                }
            }

            options.html = html;
            options.dataUrls = this.renderer._dataSources;
            options.onError = function(message, description) {
                specification.error = message;
                specification.desc = description;
            };

            const matrixType = options.instanceCount > 2 ? "in" : "uniform";

            // glsl code placed outside the main function
            const vertexShaderDefinition = `
    ${matrixType} mat3 osd_transform_matrix;
    const vec3 quad[4] = vec3[4] (
        vec3(0.0, 1.0, 1.0),
        vec3(0.0, 0.0, 1.0),
        vec3(1.0, 1.0, 1.0),
        vec3(1.0, 0.0, 1.0)
    );`;
            // glsl code placed inside the main function
            const vertexShaderExecution = `
        gl_Position = vec4(osd_transform_matrix * quad[gl_VertexID], 1);`;

            const vertexShaderCode = this.compileVertexShader(vertexShaderDefinition, vertexShaderExecution, options);

            //hack -> use 'invalid' key to attach item
            globalScopeCode[null] = definition;
            const fragmentShaderCode = this.compileFragmentShader(Object.values(globalScopeCode).join("\n"), execution, options);

            program._osdOptions = options;
            program._osdOptions.vs = vertexShaderCode;
            program._osdOptions.fs = fragmentShaderCode;
            this._compileProgram(program, options.onError || $.console.error);

            return usableShaders;
        }

        /** Get glsl code for texture sampling. Used in compileFragmentShader.
         * @param {null|string} options.textureType WebGL's texture type -> TEXTURE_2D or TEXTURE_2D_ARRAY or TEXTURE_3D
         * @returns {string} glsl code to texture sampling
         */
        getTextureSampling(options) {
            const type = options.textureType;
            if (!type) { //no texture is also allowed option todo test if valid, defined since we read its location
                /* preco je v naznve _ (_vis_data...) */
                return `
    ivec2 osd_texture_size() {
        return ivec2(0);
    }
    uniform sampler2D _vis_data_sampler[0];
    vec4 osd_texture(int index, vec2 coords) {
      return vec(.0);
    }`;
            }

            const numOfTextures = options.instanceCount =
                Math.max(options.instanceCount || 0, 1);

            function samplingCode(coords) {
                if (numOfTextures === 1) {
                    return `return texture(_vis_data_sampler[0], ${coords});`;
                }
                //sampling hardcode switch to sample with constant indexes
                return `switch(osd_texture_id) {
            ${iterate(options.instanceCount).map(i => `
            case ${i}:
                return texture(_vis_data_sampler[${i}], ${coords});`).join("")}
        }
        return vec4(1.0);`;
            }

            //todo consider sampling with vec3 for universality
            if (type === "TEXTURE_2D") {
                return `
    uniform sampler2D _vis_data_sampler[${numOfTextures}];
    ivec2 osd_texture_size() {
        return textureSize(_vis_data_sampler[0], 0);
    }
    vec4 osd_texture(int index, vec2 coords) {
        ${samplingCode('coords')}
    }`;
            }
            if (type === "TEXTURE_2D_ARRAY") {
                return `
    uniform sampler2DArray _vis_data_sampler[${numOfTextures}];
    ivec2 osd_texture_size() {
        return textureSize(_vis_data_sampler[0], 0).xy;
    }
    vec4 osd_texture(int index, vec2 coords) {
        ${samplingCode('vec3(coords, index)')}
    }`;
            } else if (type === "TEXTURE_3D") {
                //todo broken api, but pointless sending vec2 with 3d tex
                return `
    uniform sampler3D _vis_data_sampler[${numOfTextures}];
    ivec3 osd_texture_size() {
        return textureSize(_vis_data_sampler[0], 0).xy;
    }
    vec4 osd_texture(int index, vec2 coords) {
        ${samplingCode('vec3(coords, index)')}
    }`;
            }

            return 'Error: invalid texture: unsupported sampling type ' + type;
        }

        /** Get fragment shader's glsl code.
         * @param {string} definition glsl code outta main function
         * @param {string} execution glsl code inside the main function
         * @param {object} options
         * @returns {string} fragment shader's glsl code
         */
        compileFragmentShader(definition, execution, options) {
            const debug = options.debug ? `
        float twoPixels = 1.0 / float(osd_texture_size().x) * 2.0;
        vec2 distance = abs(osd_texture_bounds - osd_texture_coords);
        if (distance.x <= twoPixels || distance.y <= twoPixels) {
            final_color = vec4(1.0, .0, .0, 1.0);
            return;
        }
    ` : "";

            const fragmentShaderCode = `#version 300 es
    precision mediump float;
    precision mediump sampler2D;
    precision mediump sampler2DArray;
    precision mediump sampler3D;

    uniform float pixel_size_in_fragments;
    uniform float zoom_level;

    // utility function
    bool close(float value, float target) {
        return abs(target - value) < 0.001;
    }

    // varyings from vertex shader
    in vec2 osd_texture_coords;
    flat in vec2 osd_texture_bounds;
    flat in int osd_texture_id;

    // texture sampling${this.getTextureSampling(options)}

    // blending
    out vec4 final_color;
    vec4 _last_rendered_color = vec4(.0);
    int _last_mode = 0;
    bool _last_clip = false;
    void blend(vec4 color, int mode, bool clip) {
        //premultiplied alpha blending
        //if (_last_clip) {
        //  todo
        //} else {
            vec4 fg = _last_rendered_color;
            vec4 pre_fg = vec4(fg.rgb * fg.a, fg.a);

            if (_last_mode == 0) {
                final_color = pre_fg + (1.0-fg.a)*final_color;
            } else if (_last_mode == 1) {
                final_color = vec4(pre_fg.rgb * final_color.rgb, pre_fg.a + final_color.a);
            } else {
                final_color = vec4(.0, .0, 1.0, 1.0);
            }
        //}
        _last_rendered_color = color;
        _last_mode = mode;
        _last_clip = clip;
    }

    // definition${definition}

    void main() {
        ${debug}

        // execution${execution}

        //blend last level
        //blend(vec4(.0), 0, false);
        final_color = vec4(1.0, 0.0, 0.0, 1.0);
    }`;

            return fragmentShaderCode;
        }

        /** Get vertex shader's glsl code.
         * @param {string} definition glsl code outta main function
         * @param {string} execution glsl code inside the main function
         * @param {object} options
         * @returns {string} vertex shader's glsl code
         */
        compileVertexShader(definition, execution, options) {
            const textureId = options.instanceCount > 1 ? 'gl_InstanceID' : '0';

            const vertexShaderCode = `#version 300 es
    precision mediump float;
    in vec2 osd_tile_texture_position;
    flat out int osd_texture_id;
    out vec2 osd_texture_coords;
    flat out vec2 osd_texture_bounds;

    // definition:${definition}

    void main() {
        osd_texture_id = ${textureId};
        // vec3 vertex = quad[gl_VertexID];
        // vec2 texCoords = vec2(vertex.x, -vertex.y);
        // osd_texture_coords = texCoords;
        // osd_texture_bounds = texCoords;

        osd_texture_coords = osd_tile_texture_position;
        osd_texture_bounds = osd_tile_texture_position;

        // execution:${execution}
    }
    `;

            return vertexShaderCode;
        }

        /** Called when associated webgl program is switched to. Volane z forceswitchshader z rendereru alebo pri useCustomProgram z rendereru.
         * Nastavuje vo velkom atributy(tuto, shaderom, ich controlom) aby odpovedali odpovedajucim glsl premennym.
         * @param {WebGLProgram} program WebGLProgram to use
         * @param {object|null} spec specification corresponding to program, null when using custom program not built on any specification
         */
        programLoaded(program, spec = null) {
            // toto neviem ci je dobre lebo running hovori o tom ze renderer bezi s nejakou validnou specifikaciou...
            // ked chcem pouzit customprogram tak ale nebude bezat podla nijakej specifikacie => ajtak sa zapne running?
            // co ked este nebezal renderer a na supu chcem pouzit customprogram co potom ?
            if (!this.renderer.running) {
                return;
            }

            const gl = this.gl;
            // Allow for custom loading
            gl.useProgram(program);
            if (spec) {
                // for every shader and it's controls set theirs attributes to it's corresponding glsl variable names
                this.renderer.glLoaded(gl, program, spec);
            }

            // gl.bindVertexArray(this.vao);

            this._locationPixelSize = gl.getUniformLocation(program, "pixel_size_in_fragments");
            this._locationZoomLevel = gl.getUniformLocation(program, "zoom_level");

            const instanceCount = program._osdOptions.instanceCount;
            if (instanceCount > 1) {
                console.error("POZOR IDEM CEZ INSTANCE COUNT > 1");

                gl.bindBuffer(gl.ARRAY_BUFFER, this._bufferTexturePosition);
                this._locationTexturePosition = gl.getAttribLocation(program, 'osd_tile_texture_position');
                //vec2 * 4 bytes per element
                const vertexSizeByte = 2 * 4;
                gl.bufferData(gl.ARRAY_BUFFER, instanceCount * 4 * vertexSizeByte, gl.STREAM_DRAW);
                gl.enableVertexAttribArray(this._locationTexturePosition);
                gl.vertexAttribPointer(this._locationTexturePosition, 2, gl.FLOAT, false, 0, 0);
                gl.vertexAttribDivisor(this._locationTexturePosition, 0); // nic specialne nerobi?

                //this._bufferMatrices = this._bufferMatrices || gl.createBuffer(); presunul som do konstruktoru
                gl.bindBuffer(gl.ARRAY_BUFFER, this._bufferMatrices);

                this._locationMatrices = gl.getAttribLocation(program, "osd_transform_matrix");
                gl.bufferData(gl.ARRAY_BUFFER, 4 * 9 * instanceCount, gl.STREAM_DRAW);
                //matrix 3x3 (9) * 4 bytes per element
                const bytesPerMatrix = 4 * 9;
                for (let i = 0; i < 3; ++i) {
                    const loc = this._locationMatrices + i;
                    gl.enableVertexAttribArray(loc);
                    // note the stride and offset
                    const offset = i * 12;  // 3 floats per row, 4 bytes per float
                    gl.vertexAttribPointer(
                        loc,              // location
                        3,                // size (num values to pull from buffer per iteration)
                        gl.FLOAT,         // type of data in buffer
                        false,            // normalize
                        bytesPerMatrix,   // stride, num bytes to advance to get to next set of values
                        offset
                    );
                    // this line says this attribute only changes for each 1 instance
                    gl.vertexAttribDivisor(loc, 1);
                }

                this._textureLoc = gl.getUniformLocation(program, "_vis_data_sampler");
                gl.uniform1iv(this._textureLoc, iterate(instanceCount));

            } else { // draw one instance at the time
                this._locationMatrices = gl.getUniformLocation(program, "osd_transform_matrix");

                gl.bindBuffer(gl.ARRAY_BUFFER, this._bufferTexturePosition);
                this._locationTexturePosition = gl.getAttribLocation(program, "osd_tile_texture_position");
                gl.enableVertexAttribArray(this._locationTexturePosition);
                gl.vertexAttribPointer(this._locationTexturePosition, 2, gl.FLOAT, false, 0, 0);
            }
        }

        /** This is were drawing really happens...
         * Why is this named programUsed?
         * Fill the glsl variables and draw.
         * @param {WebGLProgram} program currently being used with renderer
         * @param {object} spec specification corresponding to program (from renderer._programSpecifications)
         * @param {WebGLTexture} texture to use
         * @param {object} tileOpts texture settings
         * @param {OpenSeadragon.Mat3} tileOpts.transform 3*3 matrix
         * @param {number} tileOpts.pixelSize
         * @param {number} tileOpts.zoom
         * @param {[8 Numbers]} tileOpts.textureCoords pri old to bolo 12 numbers(dva trojuholniky, tu si myslim ze 8 lebo pouziva triangle strip)
         */
        programUsed(program, spec, texture, tileOpts) {
            if (!this.renderer.running) {
                return;
            }

            const gl = this.gl;
            if (spec) {
                // for every shader and it's controls fill their corresponding glsl variables
                this.renderer.glDrawing(gl, program, spec);
            }

            // fill glsl variables
            gl.uniform1f(this._locationPixelSize, tileOpts.pixelSize || 1);
            gl.uniform1f(this._locationZoomLevel, tileOpts.zoom || 1);


            const instanceCount = program._osdOptions.instanceCount;
            const textureType = program._osdOptions.textureType;
            if (instanceCount > 1) { // instancovane renderovanie mozem zatial preskocit, cize asi len else vetva ma momentalne zaujima
                gl.bindBuffer(gl.ARRAY_BUFFER, this._bufferTexturePosition);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, tileOpts.textureCoords);

                gl.bindBuffer(gl.ARRAY_BUFFER, this._bufferMatrices);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, tileOpts.transform);

                let drawInstanceCount = tileOpts.instanceCount || Infinity;
                drawInstanceCount = Math.min(drawInstanceCount, instanceCount);

                for (let i = 0; i <= drawInstanceCount; i++) {
                    gl.activeTexture(gl.TEXTURE0 + i);
                    gl.bindTexture(gl.TEXTURE_2D, texture[i]); //tomuto nerozumiem ako indexovat texturu?
                }
                console.error('DRAWARRAYSINSTANCED');
                gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, drawInstanceCount);

            } else { // draw one instance at the time
                gl.bindBuffer(gl.ARRAY_BUFFER, this._bufferTexturePosition);
                gl.bufferData(gl.ARRAY_BUFFER, tileOpts.textureCoords, gl.STATIC_DRAW);

                gl.uniformMatrix3fv(this._locationMatrices, false, tileOpts.transform || $.Mat3.makeIdentity());

                // Upload texture, only one texture active, no preparation
                gl.activeTexture(gl.TEXTURE0);
                // gl.TEXTURE_2D or gl.TEXTURE_2D_ARRAY
                gl.bindTexture(gl[textureType], texture);

                // Draw triangle strip (two triangles) from a static array defined in the vertex shader
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
        }
    };

})(OpenSeadragon);

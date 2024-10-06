// 40 riadkov

(function($) {
    /**
     * Identity shader
     *
     * data reference must contain one index to the data to render using identity
     */
    $.WebGLModule.IdentityLayer = class extends $.WebGLModule.ShaderLayer {

        static type() {
            return "identity";
        }

        static name() {
            return "Identity";
        }

        // static singleSourceVariableCount}]

        static description() {
            return "shows the data AS-IS";
        }

        static sources() {
            return [{
                acceptsChannelCount: (x) => x === 4,
                description: "4d texture to render AS-IS"
            }];
        }

        getFragmentShaderExecution() {
            // osd_texture(0, osd_texture_coords).rgba
            return `
        return ${this.sampleChannel("v_texture_coords")};`;
            // return just green color
            // return 'return vec4(0, 1, 0, 0.5);';
        }
    };

    //todo why cannot be inside object :/
    $.WebGLModule.IdentityLayer.defaultControls["use_channel0"] = {
        required: "rgba"
    };

    $.WebGLModule.ShaderMediator.registerLayer($.WebGLModule.IdentityLayer);

})(OpenSeadragon);

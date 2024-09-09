// 40 riadkov

(function($) {
    /**
     * Negative shader
     *
     */
    $.WebGLModule.NegativeLayer = class extends $.WebGLModule.ShaderLayer {

        static type() {
            return "negative";
        }

        static name() {
            return "Negative";
        }

        static description() {
            return "shows the data in negative";
        }

        static sources() {
            return [{
                acceptsChannelCount: (x) => x === 4,
                description: "4d texture to render in negative"
            }];
        }

        getFragmentShaderExecution() {
            return `return vec4(vec3(1, 1, 1) - ${this.sampleChannel("v_texture_coords")}.rgb, ${this.sampleChannel("v_texture_coords")}.a);`;
        }
    };

    //todo why cannot be inside object :/
    $.WebGLModule.NegativeLayer.defaultControls["use_channel0"] = {
        required: "rgba"
    };

    $.WebGLModule.ShaderMediator.registerLayer($.WebGLModule.NegativeLayer);

})(OpenSeadragon);

#include "AEConfig.h"
#include "AE_EffectVers.h"

#ifndef AE_OS_WIN
    #define AE_OS_WIN 1
#endif

#include "Execution.r"
#include "AE_General.r"

resource 'PiPL' (16000) {
    {   /* array properties: 7 elements */
        /* [1] */
        Kind {
            AETitle
        },
        /* [2] */
        Name {
            "ASCIIArt"
        },
        /* [3] */
        Category {
            "Stylize"
        },
        /* [4] */
        Version {
            0x00010000
        },
        /* [5] */
        CodeWin64X86 {
            "EntryPointFunc"
        },
        /* [6] */
        AE_Effect_Global_OutFlags {
            0x02000000
        },
        /* [7] */
        AE_Effect_Match_Name {
            "ADBE ASCIIArt"
        }
    }
};

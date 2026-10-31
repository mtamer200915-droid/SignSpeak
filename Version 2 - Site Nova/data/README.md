# V2 data manifest and source terms

`manifest.jsonl` is a selected subset of the MS-ASL metadata; it contains labels, source video identifiers, source URLs, timestamps, and annotated signer boxes. It is provided for computational use under the [Microsoft C-UDA](https://github.com/microsoft/Computational-Use-of-Data-Agreement) terms. The agreement copies are in `licenses/`. MS-ASL metadata and source videos are not owned by this project.

When the WLASL v0.3 archive is supplied to `prepare_data.py`, locally available clips are used first; selected WLASL training sources are fetched only when needed to reach the per-word minimum. WLASL is also distributed under the C-UDA; see the [official WLASL page](https://github.com/dxli94/WLASL) for its citation and terms.

The 20 labels in this V2 subset are **book**, **deaf**, **eat**, **drink**, **family**, **go**, **happy**, **help**, **home**, **like**, **mother**, **need**, **no**, **not**, **please**, **school**, **water**, **want**, **yes**, and **you**. MS-ASL provides train, validation, and test partitions. The preparation script avoids placing one YouTube source ID in more than one partition. At least 18 training clips per word are required; short, signer-cropped samples are included in `clips/` under the source terms. The untrimmed originals and temporary downloads remain local and are excluded from Git.

Please cite the source datasets and comply with their terms when using, modifying, or redistributing this subset or the project outputs:

- Vaezi Joze, Hamid Reza, and Oscar Koller. 2019. “MS-ASL: A Large-Scale Data Set and Benchmark for Understanding American Sign Language.” BMVC.
- Li, Dongxu, et al. 2020. “Word-Level Deep Sign Language Recognition from Video: A New Large-Scale Dataset and Methods Comparison.” WACV.

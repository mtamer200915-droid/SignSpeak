"""Local experiment; image holdouts are from the same source, not new signers."""
import argparse, hashlib, io, json, random, time, zipfile
from pathlib import Path
import numpy as np
from PIL import Image
import tensorflow as tf

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--alphabet-zip', type=Path, required=True)
parser.add_argument('--heldout-cache', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--character-model', type=Path, default=root / 'api/models/signova_characters.keras')
args = parser.parse_args()
cache = args.heldout_cache
out = args.output
if out.resolve() == (root / 'api/models').resolve():
    raise SystemExit('Choose a separate output directory for the experimental model.')
out.mkdir(parents=True, exist_ok=True)
labels = list('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
seed = 42
random.seed(seed)
tf.keras.utils.set_random_seed(seed)
tf.config.threading.set_intra_op_parallelism_threads(2)
tf.config.threading.set_inter_op_parallelism_threads(2)

def digest(content):
    return hashlib.sha256(content).hexdigest()

heldout = set()
for split in ('val', 'test'):
    for label in labels:
        images = list((cache / split / label).glob('*'))
        if not images:
            raise RuntimeError(f'Missing {split} images for {label}')
        heldout.update(digest(p.read_bytes()) for p in images if p.is_file())
print('Held-out image fingerprints:', len(heldout), flush=True)

old = tf.keras.models.load_model(args.character_model, compile=False)
backbone = old.get_layer('mobilenetv2_1.00_224')
backbone.trainable = False

def pixels(content):
    with Image.open(io.BytesIO(content)) as image:
        return np.asarray(image.convert('RGB').resize((224, 224), Image.Resampling.BILINEAR), dtype=np.float32)

def features(contents, batch=32):
    outputs = []
    for start in range(0, len(contents), batch):
        images = np.stack([pixels(content) for content in contents[start:start + batch]])
        outputs.append(backbone(tf.convert_to_tensor(images / 127.5 - 1), training=False).numpy())
    return np.concatenate(outputs)

seen = set(heldout)
baseline = {}
for label in labels:
    baseline[label] = []
    for path in sorted((cache / 'train' / label).glob('*')):
        if not path.is_file():
            continue
        content = path.read_bytes()
        fingerprint = digest(content)
        if fingerprint in seen:
            raise RuntimeError(f'Duplicate training/held-out content detected for {label}')
        seen.add(fingerprint)
        baseline[label].append(content)
    if not 1 <= len(baseline[label]) <= 600:
        raise RuntimeError(f'Unexpected original training count for {label}: {len(baseline[label])}')
counts = {}
train_x, train_y = [], []
started = time.time()
with zipfile.ZipFile(args.alphabet_zip) as archive:
    by_label = {label: [] for label in labels}
    for info in archive.infolist():
        parts = info.filename.replace('\\', '/').split('/')
        if 'asl_alphabet_train' not in parts or Path(info.filename).suffix.lower() not in ('.jpg', '.jpeg'):
            continue
        index = parts.index('asl_alphabet_train')
        if index + 1 < len(parts) and parts[index + 1] in by_label:
            by_label[parts[index + 1]].append(info)
    for index, label in enumerate(labels):
        shuffled = by_label[label]
        random.Random(seed + index).shuffle(shuffled)
        contents = list(baseline[label])
        for info in shuffled:
            content = archive.read(info)
            fingerprint = digest(content)
            if fingerprint in seen:
                continue
            seen.add(fingerprint)
            contents.append(content)
            if len(contents) == 600:
                break
        if len(contents) != 600:
            raise RuntimeError(f'Only {len(contents)} unique training images found for {label}')
        counts[label] = len(contents)
        vectors = features(contents)
        train_x.append(vectors)
        train_y.append(np.full(len(vectors), index, dtype=np.int32))
        np.savez_compressed(out / f'train_{label}.npz', features=vectors)
        print(f'Training letters encoded {index+1}/26 ({label}); elapsed {time.time()-started:.0f}s', flush=True)
train_x, train_y = np.concatenate(train_x), np.concatenate(train_y)

def heldout_features(split):
    xs, ys = [], []
    for index, label in enumerate(labels):
        contents = [p.read_bytes() for p in sorted((cache / split / label).glob('*')) if p.is_file()]
        xs.append(features(contents))
        ys.append(np.full(len(contents), index, dtype=np.int32))
    return np.concatenate(xs), np.concatenate(ys)

val_x, val_y = heldout_features('val')
test_x, test_y = heldout_features('test')
print('Extracted validation and test image features.', flush=True)
inp = tf.keras.Input((1280,))
x = tf.keras.layers.Dropout(.35)(inp)
x = tf.keras.layers.Dense(256, activation='relu', kernel_regularizer=tf.keras.regularizers.l2(.001))(x)
x = tf.keras.layers.Dropout(.30)(x)
head = tf.keras.Model(inp, tf.keras.layers.Dense(len(labels), activation='softmax')(x))
head.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=.001), loss='sparse_categorical_crossentropy', metrics=['accuracy'])
head.fit(train_x, train_y, validation_data=(val_x, val_y), epochs=35, batch_size=64, verbose=2,
         callbacks=[tf.keras.callbacks.EarlyStopping(monitor='val_accuracy', patience=6, mode='max', restore_best_weights=True),
                    tf.keras.callbacks.ReduceLROnPlateau(monitor='val_loss', patience=2, factor=.5, min_lr=1e-5)])

new_prob = head.predict(test_x, verbose=0)
old_head = old.get_layer('signova_asl_character_classifier')
old_prob = old_head.predict(test_x, verbose=0)[:, 10:36]
old_pred = old_prob.argmax(axis=1)
new_pred = new_prob.argmax(axis=1)
report = {'train_counts': counts, 'test_count': len(test_y),
          'old_letter_only_top1': float(np.mean(old_pred == test_y)),
          'candidate_top1': float(np.mean(new_pred == test_y)),
          'per_letter': {label: {'count': int(np.sum(test_y == index)),
                                 'old_accuracy': float(np.mean(old_pred[test_y == index] == index)),
                                 'candidate_accuracy': float(np.mean(new_pred[test_y == index] == index))}
                         for index, label in enumerate(labels)},
          'limitation': 'Random images from same source; no independent signer/session or mobile-camera evaluation. J and Z also require motion.'}
print(json.dumps(report, indent=2), flush=True)
(out / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
images = tf.keras.Input((224, 224, 3))
output = head(backbone(tf.keras.applications.mobilenet_v2.preprocess_input(images), training=False), training=False)
tf.keras.Model(images, output, name='experimental_letter_candidate').save(out / 'letter_candidate.keras')
print('Local candidate saved:', out, flush=True)
